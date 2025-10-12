
import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

type Severidad = 'red' | 'amber'
type Ambito = 'zona' | 'jefe'

interface Alerta {
  id: string
  ambito: Ambito
  entidad: string
  metric: string
  valor: number
  umbral: number
  severidad: Severidad
  detalle: string
  ts: number
}

interface TaskItem {
  id: string
  alertId: string
  entidad: string
  metric: string
  responsable: string
  fecha: string
  detalle: string
  estado: 'pendiente' | 'en_progreso' | 'cerrado'
  createdAt: number
}

export default function App() {
  const [vista, setVista] = useState<'general'|'zona'|'jefes'>('general')
  const [periodo, setPeriodo] = useState<'1m'|'3m'|'6m'|'1a'>('3m')
  const [busqueda, setBusqueda] = useState('')
  const [selectedZona, setSelectedZona] = useState<string|null>(null)

  const [metas] = useState({
    satisfaccion: 6.3, clima: 6.2, acciona: 85, ventas: 95, comunidad: 80, poa: 85, formacion: 80
  })
  const [criticos, setCriticos] = useState<any>(() => {
    const saved = localStorage.getItem('criticos_copec')
    return saved ? JSON.parse(saved) : { satisfaccion:5.8, clima:5.8, acciona:75, ventas:85, comunidad:70, poa:80, formacion:70 }
  })
  useEffect(()=>localStorage.setItem('criticos_copec', JSON.stringify(criticos)), [criticos])

  // Tasks
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    const saved = localStorage.getItem('tasks_copec')
    return saved ? JSON.parse(saved) : []
  })
  useEffect(()=>localStorage.setItem('tasks_copec', JSON.stringify(tasks)), [tasks])
  const [taskModal, setTaskModal] = useState<{open:boolean; alerta: Alerta|null; responsable:string; fecha:string}>({
    open:false, alerta:null, responsable:'', fecha:''
  })

  const dataset = useMemo(()=>{
    const adj = ({'1m':0.0,'3m':-0.05,'6m':-0.1,'1a':-0.15} as const)[periodo]
    const zonas = [
      { zona: 'Centro-Norte', satisfaccion: +(6.2+adj).toFixed(1), clima: +(5.9+adj).toFixed(1), acciona: Math.round(85+adj*20), ventas: Math.round(92+adj*15), comunidad: Math.round(78+adj*20), poa: Math.round(84+adj*15), formacion: Math.round(76+adj*10), tendencia: [5.8,6.0,6.1,6.2,6.1,6.2] },
      { zona: 'Sur',          satisfaccion: +(6.5+adj).toFixed(1), clima: +(6.3+adj).toFixed(1), acciona: Math.round(88+adj*20), ventas: Math.round(97+adj*15), comunidad: Math.round(82+adj*20), poa: Math.round(88+adj*15), formacion: Math.round(83+adj*10), tendencia: [6.1,6.2,6.4,6.6,6.5,6.6] },
      { zona: 'Santiago',     satisfaccion: +(6.0+adj).toFixed(1), clima: +(5.7+adj).toFixed(1), acciona: Math.round(81+adj*20), ventas: Math.round(89+adj*15), comunidad: Math.round(75+adj*20), poa: Math.round(82+adj*15), formacion: Math.round(71+adj*10), tendencia: [5.6,5.7,5.9,6.0,5.8,6.0] },
    ]
    const jefes = [
      { jefe:'Jefe 1', zona:'Centro-Norte', desempeno: 6.4+adj, fortalezas:'Satisfacción y Acciona', mejoras:'Clima laboral', formacion:78, poa:84 },
      { jefe:'Jefe 2', zona:'Sur',          desempeno: 6.6+adj, fortalezas:'Ventas y Clima', mejoras:'Rel. comunitario', formacion:86, poa:90 },
      { jefe:'Jefe 3', zona:'Santiago',     desempeno: 6.1+adj, fortalezas:'Ejecución Acciona', mejoras:'Satisfacción y Clima', formacion:72, poa:80 },
    ]
    const campañas = [
      { zona:'Centro-Norte', nombre:'Puertas Abiertas ESS', avance:72, impacto:'Alto' },
      { zona:'Sur', nombre:'Reciclaje y Comunidad', avance:65, impacto:'Medio' },
      { zona:'Santiago', nombre:'Seguridad Vial Escolar', avance:83, impacto:'Alto' },
    ]
    return { zonas, jefes, campañas }
  }, [periodo])

  const promedio = (key: keyof typeof metas) => +(dataset.zonas.reduce((a,b)=>a+Number((b as any)[key]),0)/dataset.zonas.length).toFixed(1)

  const indiceGeneral = useMemo(()=>{
    const pS = promedio('satisfaccion'), pC = promedio('clima')
    const pA = promedio('acciona')/20, pV = promedio('ventas')/20, pR = promedio('comunidad')/20
    return +(((pS+pC+pA+pV+pR)/5).toFixed(1))
  }, [dataset])

  const zonasFiltradas = useMemo(()=> dataset.zonas.filter(z => (!selectedZona || z.zona===selectedZona) && z.zona.toLowerCase().includes(busqueda.toLowerCase())), [dataset, busqueda, selectedZona])

  // Alertas automáticas
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const notiEnabledRef = useRef(false)
  const vistos = useRef<Set<string>>(new Set())

  function checkMetric(ambito:Ambito, entidad:string, metric: keyof typeof criticos, valor:number, umbral:number, detalle:string): Alerta|null {
    if (valor < umbral) {
      const sev: Severidad = (metric === 'poa' || metric === 'formacion' || metric === 'ventas' || metric === 'acciona') ? 'red' : 'amber'
      const id = `${ambito}|${entidad}|${metric}|${Date.now()}`
      return { id, ambito, entidad, metric, valor, umbral, severidad: sev, detalle, ts: Date.now() }
    }
    return null
  }

  useEffect(()=>{
    const nuevas:Alerta[] = []
    dataset.zonas.forEach(z => {
      ;(['satisfaccion','clima','acciona','ventas','comunidad','poa','formacion'] as (keyof typeof criticos)[]).forEach(k=>{
        const valor = (z as any)[k] as number
        const umbral = criticos[k]
        const a = checkMetric('zona', z.zona, k, valor, umbral, `${k} = ${valor} < ${umbral}`)
        if (a) nuevas.push(a)
      })
    })
    dataset.jefes.forEach(j => {
      ;(['poa','formacion'] as (keyof typeof criticos)[]).forEach(k=>{
        const valor = (j as any)[k] as number
        const umbral = criticos[k]
        const a = checkMetric('jefe', j.jefe, k, valor, umbral, `${k} = ${valor} < ${umbral}`)
        if (a) nuevas.push(a)
      })
    })
    const unicos = nuevas.filter(a=>{ const base = `${a.ambito}|${a.entidad}|${a.metric}`; if (vistos.current.has(base)) return false; vistos.current.add(base); return true })
    if (unicos.length) {
      setAlertas(prev=>[...unicos, ...prev].slice(0,200))
      if (notiEnabledRef.current && 'Notification' in window && Notification.permission === 'granted') {
        unicos.slice(0,3).forEach(a=>{ try { new Notification(`Alerta ${a.severidad==='red'?'CRÍTICA':'Atención'}`, { body: `${a.ambito==='zona'?'Zona':'Jefe'} ${a.entidad}: ${a.metric} ${a.valor} < ${a.umbral}` }) } catch {} })
      }
    }
  }, [dataset, criticos])

  const hayCriticas = alertas.some(a=>a.severidad==='red')

  function solicitarNotificaciones() {
    if (!('Notification' in window)) return
    Notification.requestPermission().then(perm=>{ notiEnabledRef.current = perm==='granted'; if (perm!=='granted') alert('Permite notificaciones para recibir alertas.') })
  }

  function openTaskFromAlert(a: Alerta) {
    const today = new Date().toISOString().slice(0,10)
    setTaskModal({ open:true, alerta:a, responsable:'', fecha: today })
  }
  function createTask() {
    if (!taskModal.alerta) return
    const t: TaskItem = {
      id: `task_${Date.now()}`, alertId: taskModal.alerta.id, entidad: taskModal.alerta.entidad,
      metric: taskModal.alerta.metric, responsable: taskModal.responsable || '(sin asignar)',
      fecha: taskModal.fecha || new Date().toISOString().slice(0,10), detalle: taskModal.alerta.detalle,
      estado: 'pendiente', createdAt: Date.now()
    }
    setTasks(prev=>[t, ...prev]); setTaskModal({open:false, alerta:null, responsable:'', fecha:''}); alert('Task creada (mock).')
  }
  function setEstadoTask(id:string, estado: TaskItem['estado']) { setTasks(prev=>prev.map(t=>t.id===id?{...t, estado}:t)) }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }

  const tendenciaGeneral = [
    { mes: 'Ene', valor: 5.8 }, { mes: 'Feb', valor: 6.0 }, { mes: 'Mar', valor: 6.2 },
    { mes: 'Abr', valor: 6.4 }, { mes: 'May', valor: 6.3 }, { mes: 'Jun', valor: 6.5 },
  ]

  return (
    <div className="p-6 min-h-screen">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.webp" alt="Copec" className="h-10 w-auto object-contain" />
          <h1 className="text-2xl font-bold text-[--copec-red]">Dashboard Copec</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="select" value={periodo} onChange={e=>setPeriodo(e.target.value as any)}>
            <option value="1m">Último mes</option>
            <option value="3m">Últ. 3 meses</option>
            <option value="6m">Últ. 6 meses</option>
            <option value="1a">Últ. 12 meses</option>
          </select>
          <input className="input" placeholder="Buscar zona…" value={busqueda} onChange={e=>setBusqueda(e.target.value)} />
          <hr className="div h-6 mx-1" />
          <button className={`btn ${vista==='general'?'btn-primary':''}`} onClick={()=>setVista('general')}>General</button>
          <button className={`btn ${vista==='zona'?'btn-primary':''}`} onClick={()=>{ setVista('zona'); setSelectedZona(null) }}>Por zona</button>
          <button className={`btn ${vista==='jefes'?'btn-primary':''}`} onClick={()=>setVista('jefes')}>Por jefe</button>
          <hr className="div h-6 mx-1" />
          <button className="btn btn-ghost" onClick={toggleTheme}>Modo oscuro</button>
        </div>
      </header>

      {alertas.length>0 && (
        <div className={`mb-4 p-3 rounded-2xl border ${hayCriticas?'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900':'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'}`}>
          <p className="text-sm">{hayCriticas?'Existen alertas CRÍTICAS activas.':'Existen alertas de atención activas.'} Revisa el Centro de alertas.</p>
        </div>
      )}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button className="btn" onClick={()=>window.print()}>Imprimir / PDF</button>
        <button className="btn" onClick={solicitarNotificaciones}>Habilitar notificaciones</button>
        <button className="btn" onClick={()=>{
          const row:any = {
            indice_general: indiceGeneral,
            satisfaccion_prom: promedio('satisfaccion'),
            clima_prom: promedio('clima'),
            acciona_prom: promedio('acciona'),
            ventas_prom: promedio('ventas'),
            comunidad_prom: promedio('comunidad'),
            poa_prom: promedio('poa'),
            formacion_prom: promedio('formacion')
          }
          const headers = Object.keys(row)
          const csv = [headers.join(',')] + [headers.map(h=>JSON.stringify(row[h]??'')).join(',')]
          const blob = new Blob([csv.join('\n')], {type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`reporte_general_${periodo}.csv`; a.click(); URL.revokeObjectURL(url)
        }}>Descargar CSV</button>

        <details className="ml-auto w-full md:w-auto open:mb-2">
          <summary className={`btn ${hayCriticas?'!bg-red-600 !text-white border-red-600':''}`}>Alertas ({alertas.length})</summary>
          <div className="mt-2 p-3 card w-full md:w-[720px] max-h-[60vh] overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-500">Umbrales críticos configurables (guardados en este navegador)</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {alertas.length===0 && <p className="text-sm text-slate-500">Sin alertas por ahora.</p>}
              {alertas.map(a => (
                <div key={a.id} className="border rounded-xl p-2 flex items-start gap-3 dark:border-slate-800">
                  <span className={`dot ${a.severidad==='red'?'dot-red':'dot-amber'}`} />
                  <div className="text-sm flex-1">
                    <div className="font-semibold">{a.ambito==='zona'?'Zona':'Jefe'}: {a.entidad}</div>
                    <div className="text-slate-700 dark:text-slate-200">{a.metric}: <strong>{a.valor}</strong> (umbral {a.umbral})</div>
                    <div className="text-slate-500">{new Date(a.ts).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn" onClick={()=>openTaskFromAlert(a)}>Crear task</button>
                  </div>
                </div>
              ))}
            </div>
            {taskModal.open && (
              <div className="border rounded-xl p-3 mt-3 dark:border-slate-800">
                <p className="text-sm font-semibold mb-2">Nueva tarea desde alerta</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <div className="text-xs text-slate-600 md:col-span-3">{taskModal.alerta?.detalle}</div>
                  <div className="text-xs">Responsable</div>
                  <input className="input" placeholder="Nombre del responsable" value={taskModal.responsable} onChange={e=>setTaskModal(v=>({...v, responsable:e.target.value}))} />
                  <div />
                  <div className="text-xs">Fecha compromiso</div>
                  <input className="input" type="date" value={taskModal.fecha} onChange={e=>setTaskModal(v=>({...v, fecha:e.target.value}))} />
                  <div />
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-primary" onClick={createTask}>Guardar task</button>
                  <button className="btn" onClick={()=>setTaskModal({open:false, alerta:null, responsable:'', fecha:''})}>Cancelar</button>
                </div>
              </div>
            )}
            <div className="mt-3">
              <p className="text-sm font-semibold mb-2">Tareas (mock)</p>
              {tasks.length===0 && <p className="text-sm text-slate-500">Aún no hay tareas.</p>}
              <div className="grid grid-cols-1 gap-2">
                {tasks.map(t => (
                  <div key={t.id} className="border rounded-xl p-2 text-sm dark:border-slate-800">
                    <div className="flex justify-between items-center">
                      <div className="font-semibold">{t.entidad} • {t.metric}</div>
                      <div className="flex gap-2 items-center">
                        <select value={t.estado} onChange={e=>setEstadoTask(t.id, e.target.value as any)} className="input text-xs">
                          <option value="pendiente">pendiente</option>
                          <option value="en_progreso">en_progreso</option>
                          <option value="cerrado">cerrado</option>
                        </select>
                        <span className={`badge ${t.estado==='cerrado'?'badge-ok':t.estado==='en_progreso'?'badge-warn':'bg-slate-400 text-white'}`}>{t.estado}</span>
                      </div>
                    </div>
                    <div className="text-slate-700 dark:text-slate-200">Resp.: <strong>{t.responsable}</strong> • Fecha: <strong>{t.fecha}</strong></div>
                    <div className="text-slate-500">{t.detalle}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs text-slate-500">Editar umbrales (críticos)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {Object.keys(criticos).map((k:any) => (
                  <div key={k} className="text-xs">
                    <label className="block text-slate-600 mb-1">{k}</label>
                    <input type="number" defaultValue={criticos[k]} step="0.1" className="input w-full"
                      onBlur={(e)=>setCriticos((c:any)=>({...c,[k]: Number(e.target.value)}))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>
      </div>

      {vista==='general' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card col-span-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Índice General de Desempeño</h2>
              <span className="badge border border-slate-200 dark:border-slate-800">Período: {periodo.toUpperCase()}</span>
            </div>
            <p className="kpi mt-2">{indiceGeneral}</p>
            <p className="text-sm text-slate-500">Promedio ponderado (Satisfacción, Clima, Acciona, Ventas, Comunidad)</p>
          </div>

          {['satisfaccion','clima','acciona','ventas','comunidad','formacion'].map((k)=>{
            const val = promedio(k as any)
            const meta = (metas as any)[k]
            const gap = +(val - meta).toFixed(1)
            const ok = gap >= 0
            return (
              <div className="card p-4" key={k}>
                <h3 className="card-title capitalize">{k==='acciona'||k==='ventas'||k==='formacion'?k+' (%)':k}</h3>
                <div className="flex items-center gap-3">
                  <p className="kpi">{val}{k==='acciona'||k==='ventas'||k==='formacion'?'%':''}</p>
                  <span className={`badge ${ok?'badge-ok':'badge-warn'}`}>{ok?'+':''}{gap}{k==='acciona'||k==='ventas'||k==='formacion'?'%':''} vs meta</span>
                </div>
              </div>
            )
          })}

          <div className="card col-span-3 p-4">
            <h3 className="card-title">Tendencia general</h3>
            <div style={{width:'100%', height:200}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[
                  { mes: 'Ene', valor: 5.8 }, { mes: 'Feb', valor: 6.0 }, { mes: 'Mar', valor: 6.2 },
                  { mes: 'Abr', valor: 6.4 }, { mes: 'May', valor: 6.3 }, { mes: 'Jun', valor: 6.5 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis domain={[5,7]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="valor" stroke="#E30613" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card col-span-3 p-4">
            <h3 className="card-title">Campañas de relacionamiento comunitario</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
              {dataset.campañas.map(c=>(
                <div key={c.nombre} className="border rounded-xl p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[--copec-blue] dark:text-slate-200">{c.nombre}</p>
                    <span className={`badge ${c.impacto==='Alto'?'badge-ok':'badge-warn'}`}>{c.impacto}</span>
                  </div>
                    <p className="text-sm text-slate-500">Zona: {c.zona}</p>
                    <div className="mt-2 text-sm">Avance: <span className="font-semibold">{c.avance}%</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {vista==='zona' && (
        <div className="grid grid-cols-1 gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Comparativo por zona</h3>
              <span className="text-xs text-slate-500">Tip: clic en una barra para ver jefes de esa zona</span>
            </div>
            <div style={{width:'100%', height:320}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zonasFiltradas} onClick={(e:any)=>{ if (e?.activeLabel) { setSelectedZona(e.activeLabel); setVista('jefes') } }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="zona" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="satisfaccion" fill="#E30613" name="Satisfacción" />
                  <Bar dataKey="clima" fill="#0055A4" name="Clima" />
                  <Bar dataKey="ventas" fill="#A7A9AC" name="Ventas" />
                  <Bar dataKey="formacion" fill="#E30613" name="Formación" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {vista==='jefes' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dataset.jefes.filter(j=>!selectedZona || j.zona===selectedZona).map(j=>(
            <div key={j.jefe} className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="card-title">{j.jefe}</h3>
                  <p className="text-sm text-slate-500">Zona: {j.zona}</p>
                </div>
                <span className="badge border border-slate-200 dark:border-slate-800">Índice</span>
              </div>
              <p className="kpi mt-1">{j.desempeno.toFixed(1)}</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <div>POA: <strong>{j.poa}%</strong> <span className={`badge ${j.poa>=metas.poa?'badge-ok':'badge-warn'} ml-1`}>{j.poa>=metas.poa?'OK':'Bajo'}</span></div>
                <div>Formación: <strong>{j.formacion}%</strong> <span className={`badge ${j.formacion>=metas.formacion?'badge-ok':'badge-warn'} ml-1`}>{j.formacion>=metas.formacion?'OK':'Bajo'}</span></div>
              </div>
              <div className="mt-3">
                <p className="text-sm font-semibold text-[--copec-blue] dark:text-slate-200">Fortalezas</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{j.fortalezas}</p>
              </div>
              <div className="mt-2">
                <p className="text-sm font-semibold text-[--copec-blue] dark:text-slate-200">Oportunidades</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{j.mejoras}</p>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="btn btn-primary" onClick={()=>alert('Acción: plan de mejora (mock)')}>Plan de mejora</button>
                <button className="btn" onClick={()=>alert('Acción: descargar ficha (mock)')}>Descargar ficha</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
