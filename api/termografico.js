const crypto = require('crypto');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'termografias';
const SESSION_SECRET = process.env.APP_SESSION_SECRET || SERVICE_KEY;

function ensureEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.');
}
function value(row, keys, fallback = '') { for (const k of keys) if (row?.[k] !== undefined && row?.[k] !== null) return row[k]; return fallback; }
function active(v) { return ['true','t','1','si','sí','s','activo','active','verdadero'].includes(String(v).toLowerCase().trim()); }
function roleName(v) { const r=String(v||'tecnico').toLowerCase(); return r==='admin'?'Administrador':r==='tecnico'||r==='técnico'?'Técnico':r==='supervisor'?'Supervisor':r==='jefe'?'Jefe':'Técnico'; }
function safeName(v) { return String(v||'imagen.jpg').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100); }
function apiHeaders(extra={}) { return { apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, 'Content-Type':'application/json', ...extra }; }
async function request(path, options={}) {
  ensureEnv(); const res=await fetch(`${SUPABASE_URL}${path}`,{...options,headers:apiHeaders(options.headers)}); const text=await res.text();
  let data=null; try{data=text?JSON.parse(text):null}catch{data=text} if(!res.ok) throw new Error(data?.message||data?.hint||text||`Supabase ${res.status}`); return data;
}
async function select(table, query='') { return await request(`/rest/v1/${encodeURIComponent(table)}?select=*${query?`&${query}`:''}`)||[]; }
async function insert(table, rows) { return await request(`/rest/v1/${encodeURIComponent(table)}`,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(rows)}); }
async function patchRows(table, filter, data) { return await request(`/rest/v1/${encodeURIComponent(table)}?${filter}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(data)}); }
async function upsert(table, rows, conflict) { return await request(`/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(conflict)}`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(rows)}); }

function encode(data){return Buffer.from(JSON.stringify(data)).toString('base64url')}
function tokenFor(user){const body=encode({code:user.codigo,name:user.nombre,role:user.rol,exp:Date.now()+8*60*60*1000});const sig=crypto.createHmac('sha256',SESSION_SECRET).update(body).digest('base64url');return `${body}.${sig}`}
function verifyToken(req){const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const [body,sig]=raw.split('.');if(!body||!sig)throw new Error('Sesión requerida.');const expected=crypto.createHmac('sha256',SESSION_SECRET).update(body).digest('base64url');if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new Error('Sesión inválida.');const data=JSON.parse(Buffer.from(body,'base64url').toString());if(data.exp<Date.now())throw new Error('La sesión expiró.');return data}
function publicUser(row){return {codigo:String(value(row,['Codigo','codigo'])),nombre:String(value(row,['Nombre','nombre'])),rol:roleName(value(row,['Rol','rol'])),grupo:String(value(row,['Grupo','grupo'],'Todos'))}}
function inspectionToClient(x){return {id:x.Id,date:x.Fecha,week:String(x.Semana),workOrder:x.NroOrden||'',group:x.Grupo,machine:x.Maquina,component:x.Componente,conformity:x.Conformidad,temperature:String(x.Temperatura),observation:x.Observacion||'',wantsImage:x.AgregaraImagen?'Sí':'No',inspector:x.Inspector,critic:x.Criticidad,state:x.Estado,palette:x.Paleta||'',minTemp:x.TemperaturaMinima??'',maxTemp:x.TemperaturaMaxima??'',pointTemp:x.TemperaturaPunto??'',delta:x.DiferenciaT??'',emissivity:x.Emisividad??'',distance:x.Distancia??'',techObservation:x.ObservacionTecnica||'',conclusion:x.Conclusion||'',action:x.AccionTomada||'',closedBy:x.CerradoPor||'',closedAt:x.FechaCierre||'',thermalImages:[],imageRows:[]}}
async function signedUrl(path){const d=await request(`/storage/v1/object/sign/${BUCKET}/${path}`,{method:'POST',body:JSON.stringify({expiresIn:3600})});return d?.signedURL?`${SUPABASE_URL}/storage/v1${d.signedURL}`:''}
async function bootstrap(){
  const [cfg,rawIns,auditRows,imageRows,userRows]=await Promise.all([select('tbTermoConfiguracion','Activo=eq.true&order=Grupo.asc,Maquina.asc'),select('tbTermoInspecciones','order=Fecha.desc,created_at.desc'),select('tbTermoAuditoria','order=created_at.desc&limit=500'),select('tbTermoImagenes','Activo=eq.true'),select('tbUsuarios','order=Nombre.asc')]);
  const inspections=rawIns.map(inspectionToClient), map=new Map(inspections.map(x=>[x.id,x]));
  await Promise.all(imageRows.map(async im=>{const x=map.get(im.InspeccionId);if(x){const url=await signedUrl(im.StoragePath);x.thermalImages.push(url);x.imageRows.push({id:im.Id,path:im.StoragePath,url})}}));
  return {users:userRows.map(publicUser),machines:cfg.map(x=>({id:x.Id,group:x.Grupo,name:x.Maquina,component:x.Componente,normal:Number(x.LimiteNormal),alert:Number(x.LimiteAlerta),danger:Number(x.LimitePeligro),imageRequired:!!x.ImagenRequerida})),inspections,audit:auditRows.map(a=>({at:new Date(a.created_at).toLocaleString('es-PE'),user:a.Usuario,role:a.Rol,action:a.Accion,inspectionId:a.InspeccionId||'',before:a.ValorAnterior?JSON.stringify(a.ValorAnterior):'',after:a.ValorNuevo?JSON.stringify(a.ValorNuevo):'',reason:a.Motivo||''}))};
}
async function writeAudit(user, action, inspectionId=null, before=null, after=null, reason=''){await insert('tbTermoAuditoria',[{InspeccionId:inspectionId||null,UsuarioCodigo:user.code,Usuario:user.name,Rol:user.role,Accion:action,ValorAnterior:before,ValorNuevo:after,Motivo:reason}])}
async function saveInspections(user, rows){const payload=rows.map(x=>({Fecha:x.date,Semana:Number(x.week),NroOrden:x.workOrder||'',Grupo:x.group,Maquina:x.machine,Componente:x.component,Conformidad:x.conformity,Temperatura:Number(x.temperature),Observacion:x.observation||'',AgregaraImagen:x.wantsImage==='Sí',InspectorCodigo:user.code,Inspector:user.name,Criticidad:x.critic,Estado:x.state}));const saved=await insert('tbTermoInspecciones',payload);await Promise.all(saved.map(x=>writeAudit(user,'Inspección registrada',x.Id,null,{Maquina:x.Maquina,Componente:x.Componente,Temperatura:x.Temperatura,Criticidad:x.Criticidad})));return saved.map(inspectionToClient)}
async function updateInspection(user,x){const allowed={Paleta:x.palette||'',TemperaturaMinima:x.minTemp===''?null:Number(x.minTemp),TemperaturaMaxima:x.maxTemp===''?null:Number(x.maxTemp),TemperaturaPunto:x.pointTemp===''?null:Number(x.pointTemp),DiferenciaT:x.delta===''?null:Number(x.delta),Emisividad:x.emissivity===''?null:Number(x.emissivity),Distancia:x.distance===''?null:Number(x.distance),ObservacionTecnica:x.techObservation||'',Criticidad:x.critic,Estado:x.state,Conformidad:x.conformity,Conclusion:x.conclusion||'',AccionTomada:x.action||'',CerradoPor:x.closedBy||'',FechaCierre:x.closedAt||null,updated_at:new Date().toISOString()};const before=(await select('tbTermoInspecciones',`Id=eq.${encodeURIComponent(x.id)}&limit=1`))[0];const out=await patchRows('tbTermoInspecciones',`Id=eq.${encodeURIComponent(x.id)}`,allowed);await writeAudit(user,x.state==='Cerrada'?'Inspección cerrada':'Inspección actualizada',x.id,{Criticidad:before?.Criticidad,Estado:before?.Estado},{Criticidad:x.critic,Estado:x.state},x.action||'');return inspectionToClient(out[0])}
async function saveConfig(user,rows){if(user.role!=='Administrador')throw new Error('Solo el Administrador puede modificar la configuración.');const payload=rows.map(x=>({Grupo:x.group,Maquina:x.name,Componente:x.component,LimiteNormal:Number(x.normal),LimiteAlerta:Number(x.alert),LimitePeligro:Number(x.danger),Activo:true,updated_at:new Date().toISOString()}));await upsert('tbTermoConfiguracion',payload,'Maquina,Componente');await writeAudit(user,'Configuración térmica actualizada',null,null,{registros:rows.length});return {saved:rows.length}}
async function uploadImage(user,p){const match=String(p.dataUrl||'').match(/^data:([^;]+);base64,(.+)$/);if(!match)throw new Error('Formato de imagen no válido.');const buffer=Buffer.from(match[2],'base64');if(buffer.length>4*1024*1024)throw new Error('La imagen supera el máximo de 4 MB.');const path=`${p.inspectionId}/${Date.now()}-${safeName(p.fileName)}`;const res=await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':match[1],'x-upsert':'false'},body:buffer});if(!res.ok)throw new Error(await res.text());const row=(await insert('tbTermoImagenes',[{InspeccionId:p.inspectionId,StoragePath:path,NombreArchivo:safeName(p.fileName),MimeType:match[1],Tamano:buffer.length,CargadoPor:user.name}]))[0];await writeAudit(user,'Imagen cargada',p.inspectionId,null,{NombreArchivo:row.NombreArchivo});return {id:row.Id,path,url:await signedUrl(path)}}
async function removeImage(user,p){const rows=await patchRows('tbTermoImagenes',`Id=eq.${encodeURIComponent(p.imageId)}&InspeccionId=eq.${encodeURIComponent(p.inspectionId)}`,{Activo:false});if(!rows.length)throw new Error('Imagen no encontrada.');await writeAudit(user,'Imagen invalidada',p.inspectionId,{ImagenId:p.imageId},{Activo:false},p.reason||'Retirada antes del cierre');return {removed:true}}

module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end(); if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  try{
    const {action,payload={}}=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(action==='login'){const code=String(payload.codigo||'').trim(),pw=String(payload.pw||'');const rows=await select('tbUsuarios',`Codigo=eq.${encodeURIComponent(code)}&limit=1`),row=rows[0];if(!row||!active(value(row,['Activo','activo'],true))||String(value(row,['Contrasena','Contraseña','contrasena']))!==pw)return res.status(200).json(null);const user=publicUser(row);return res.status(200).json({...user,token:tokenFor(user)});}
    const user=verifyToken(req);
    if(action==='bootstrap')return res.status(200).json(await bootstrap());
    if(action==='saveInspections')return res.status(200).json({rows:await saveInspections(user,payload.rows||[])});
    if(action==='updateInspection')return res.status(200).json(await updateInspection(user,payload));
    if(action==='saveConfig')return res.status(200).json(await saveConfig(user,payload.rows||[]));
    if(action==='uploadImage')return res.status(200).json(await uploadImage(user,payload));
    if(action==='removeImage')return res.status(200).json(await removeImage(user,payload));
    return res.status(400).json({error:'Acción desconocida.'});
  }catch(err){const status=/sesión/i.test(err.message)?401:500;return res.status(status).json({error:err.message||'Error interno.'})}
};
