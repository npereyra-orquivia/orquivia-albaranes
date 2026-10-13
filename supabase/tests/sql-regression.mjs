// Local PostgreSQL integration checks. Run: npm run test:sql.
// Optional external runtime override: node supabase/tests/sql-regression.mjs <module-file-url>.
// Tests real SQL/RLS/RPC semantics with small Auth/Storage stubs. They never touch cloud data.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
const db = new PGlite()
const ids = { manager: '00000000-0000-4000-8000-000000000001', worker: '00000000-0000-4000-8000-000000000002', other: '00000000-0000-4000-8000-000000000003', outsider: '00000000-0000-4000-8000-000000000004' }
let checks = 0
async function actor(id, run) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`)
  try { return await run() } finally { await db.exec('reset role; reset request.jwt.claim.sub;') }
}
async function deny(operation, pattern) { await assert.rejects(operation, pattern); checks++ }
async function rpc(name, payload, version) {
  const params = version === undefined ? [JSON.stringify(payload)] : [JSON.stringify(payload), version]
  const placeholders = version === undefined ? '$1::jsonb' : '$1::jsonb,$2::integer'
  return (await db.query(`select public.${name}(${placeholders}) as value`, params)).rows[0].value
}
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner uuid default auth.uid());
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
    create publication supabase_realtime;
  `)
  const migration = await readFile(new URL('../migrations/202610130001_initial.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  checks++
  await db.exec(`insert into auth.users(id) values ('${ids.manager}'),('${ids.worker}'),('${ids.other}'),('${ids.outsider}');`)
  await db.exec(`insert into public.profiles(id,name,role) values ('${ids.manager}','Responsable','manager'),('${ids.worker}','Operario 1','worker'),('${ids.other}','Operario 2','worker');`)
  const clientId = '10000000-0000-4000-8000-000000000001'
  await actor(ids.manager, async () => {
    await rpc('save_company', { name: 'Orquivia', defaultVat: 21, laborRate: 35 })
    await rpc('save_client', { id: clientId, name: 'Cliente ficticio', site: 'Centro ficticio' })
  })
  const orderId = '20000000-0000-4000-8000-000000000001'
  const itemId = '30000000-0000-4000-8000-000000000001'
  const draft = { id: orderId, title: 'Reparar falso techo', description: 'Sustituir placa dañada', clientId, clientName: 'IGNORADO', site: 'Centro ficticio', locationType: 'unit', locationDetail: 'Unidad 12', priority: 'normal', status: 'pending', createdBy: ids.other, hours: 1.5, laborRate: 999, vatRate: 99, serviceDate: '2026-10-13', items: [{ id: itemId, description: 'Placa', quantity: 2, unit: 'ud', unitPrice: 999 }], photos: [], notes: '', assistance: false, assistanceNote: '' }
  let workerOrder
  await actor(ids.worker, async () => {
    workerOrder = await rpc('save_order', draft, 0)
    assert.equal(workerOrder.createdBy, ids.worker); assert.equal(workerOrder.clientName, 'Cliente ficticio'); assert.equal(workerOrder.version, 1)
    assert.equal(workerOrder.laborRate, 0); assert.equal(workerOrder.items[0].unitPrice, 0); checks += 5
    await deny(() => rpc('save_company', { name: 'Ataque', defaultVat: 21, laborRate: 1 }), /FORBIDDEN/)
    await deny(() => db.query("update public.profiles set role='manager' where id=$1", [ids.worker]), /permission denied/)
    await deny(() => db.query("update public.orders set status='sent' where id=$1", [orderId]), /permission denied/)
    await deny(() => db.query("insert into public.audit_entries(actor_name,action) values('Falso','Falso')"), /permission denied/)
    assert.equal((await db.query('select * from public.valuations')).rows.length, 0)
    assert.equal((await db.query('select * from public.company_rates')).rows.length, 0); checks += 2
    await deny(() => rpc('save_order', { ...workerOrder, status: 'valued' }, 1), /FORBIDDEN/)
    await deny(() => rpc('save_order', { ...workerOrder, title: 'Edición obsoleta' }, 0), /VERSION_CONFLICT/)
  })
  await actor(ids.other, async () => {
    const app = (await db.query('select public.load_app() as value')).rows[0].value
    assert.equal(app.orders.length, 0); checks++
    await deny(() => rpc('save_order', { ...draft, title: 'Ataque' }, 1), /FORBIDDEN/)
    await deny(() => db.query("insert into storage.objects(bucket_id,name) values('order-photos',$1)", [`${orderId}/40000000-0000-4000-8000-000000000001.jpg`]), /row-level security/)
  })
  await actor(ids.outsider, async () => {
    await deny(() => db.query('select public.load_app()'), /NO_PROFILE/)
    await deny(() => rpc('save_order', draft, 1), /NO_PROFILE/)
  })
  await actor(ids.manager, async () => {
    const app = (await db.query('select public.load_app() as value')).rows[0].value
    const order = app.orders[0]
    assert.equal(order.laborRate, 35); assert.equal(order.vatRate, 21); checks += 2
    await rpc('save_order', { ...order, items: order.items.map(i => ({ ...i, unitPrice: 12.5 })) }, 1)
  })
  await actor(ids.worker, async () => {
    const photoId = '40000000-0000-4000-8000-000000000001', photoPath = `${orderId}/${photoId}.jpg`
    await db.query("insert into storage.objects(bucket_id,name) values('order-photos',$1)", [photoPath])
    workerOrder = await rpc('save_order', { ...workerOrder, photos: [{ id: photoId, path: photoPath, name: 'techo.jpg' }], notes: 'Material confirmado' }, 2)
    assert.equal(workerOrder.version, 3); assert.equal(workerOrder.photos[0].path, photoPath); checks += 2
    await deny(() => rpc('save_order', { ...workerOrder, photos: [{ id: photoId, path: `${ids.other}/${photoId}.jpg`, name: 'fuera.jpg' }] }, 3), /Ruta de foto/)
  })
  await actor(ids.manager, async () => {
    let app = (await db.query('select public.load_app() as value')).rows[0].value
    let order = app.orders[0]
    assert.equal(order.laborRate, 35); assert.equal(order.vatRate, 21); assert.equal(order.items[0].unitPrice, 12.5); checks += 3
    order = await rpc('save_order', { ...order, laborRate: 40, items: order.items.map(i => ({ ...i, unitPrice: 18.5 })), status: 'valued' }, order.version)
    assert.equal(order.version, 4); assert.equal(order.items[0].unitPrice, 18.5); checks += 2
    app = (await db.query('select public.load_app() as value')).rows[0].value
    assert.ok(app.audit.some(a => a.orderId === orderId && a.actorName === 'Operario 1' && a.changes.after?.notes === 'Material confirmado'))
    assert.ok(app.audit.some(a => a.action === 'Valoración actualizada' && a.changes.after?.labor_rate === 40)); checks += 2
    await deny(() => db.query('select public.set_profile_role($1,$2)', [ids.manager, 'worker']), /propio acceso/)
    await deny(() => db.query('delete from public.audit_entries'), /permission denied/)
  })
  await actor(ids.worker, async () => {
    await deny(() => rpc('save_order', { ...workerOrder, title: 'Editar valorado' }, 4), /LOCKED_ORDER/)
    const app = (await db.query('select public.load_app() as value')).rows[0].value
    assert.ok(app.audit.every(a => a.action !== 'Valoración actualizada'))
    assert.equal(app.orders[0].items[0].unitPrice, 0)
    assert.equal(app.orders[0].laborRate, 0); checks += 3
    await deny(() => db.query("insert into storage.objects(bucket_id,name) values('order-photos',$1)", [`${orderId}/40000000-0000-4000-8000-000000000002.jpg`]), /row-level security/)
  })
  await actor(ids.manager, async () => {
    const before = (await db.query('select public.load_app() as value')).rows[0].value
    await deny(() => rpc('save_order', { ...before.orders[0], description: '' }, 4), /check constraint/)
    const after = (await db.query('select public.load_app() as value')).rows[0].value
    assert.equal(after.orders[0].version, 4)
    assert.equal(after.audit.length, before.audit.length); checks += 2
    // More than 9999 parts must remain unique, rather than truncating the sequence.
  })
  await db.query("select setval('public.order_number_seq',9999)")
  await actor(ids.worker, async () => {
    const saved = await rpc('save_order', { ...draft, id: '20000000-0000-4000-8000-000000000002' }, 0)
    assert.ok(saved.number.endsWith('-10000')); checks++
  })
  console.log(`PostgreSQL migration + RLS/RPC: ${checks} checks passed.`)
} finally { await db.close() }
