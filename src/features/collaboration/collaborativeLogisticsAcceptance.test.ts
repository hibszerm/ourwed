import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCollaborativeLogisticsProjection } from './collaborativeLogisticsService'
import { selectCanonicalLogisticsPlace } from './collaborativeLogisticsTypes'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const migration = read('supabase/migrations/20261016115805_collaboration_v3_logistics.sql')
const page = read('src/pages/WeddingDetailModernPage.tsx')
const shared = read('src/features/weddings/modern-detail/SharedV3LogisticsWorkspace.tsx')
const ownerLogistics = read('src/features/weddings/modern-detail/ModernWeddingLogisticsWorkspace.tsx')
const authority = read('src/features/weddings/detail/weddingDetailAuthority.ts')
let assertions = 0
function check(condition: unknown, message: string) { assertions++; assert.ok(condition, message) }

check(migration.includes('create function public.get_collaborative_wedding_logistics_v3'), 'narrow V3 read RPC exists')
check(migration.includes('create function public.mutate_collaborative_wedding_logistics_v3'), 'single operation-oriented V3 command exists')
check(migration.includes("check (resource_type in ('place_address','place_name','operational_time'))"), 'private versions support name freshness alongside existing resources')
check(migration.includes("advance_operational_version(new.wedding_id,'place_name',v_new_role)"), 'owner and collaborator inserts advance name generation')
check(migration.includes('old.label is distinct from new.label'), 'owner label edits advance name generation through the existing place trigger')
check(migration.includes("resolve_wedding_area_level(p_wedding_id,'logistics')"), 'server resolves frozen Logistics level')
check(migration.includes("if v_level<2 then raise exception using errcode='P0001',message='FORBIDDEN'"), 'server requires Logistics edit for writes')
check(migration.includes("if v_level < 1 then raise exception using errcode='P0001',message='FORBIDDEN'"), 'server denies Logistics none reads')
check(migration.includes('set search_path = \'\''), 'new definer functions pin empty search_path')
check(migration.includes('from public,anon,service_role') && migration.includes('to authenticated'), 'public RPCs are authenticated-only')
check(migration.includes("delete from public.wedding_operational_times where wedding_id=p_wedding_id and stop_key=v_place_id::text"), 'place clear removes only its exact operational-time sidecar')
check(!/insert\s+into\s+public\.wedding_places[^;]*['"]other['"]/is.test(migration), 'command contains no generic other-stage insertion')
check(!migration.includes('resolve_wedding_travel_fee'), 'Logistics command cannot resolve commercial travel fee')
check(!migration.includes('contract_value') && !migration.includes('wedding.price'), 'migration does not write commercial wedding values')
check(!/create policy|alter table public\.(weddings|wedding_places).*row level security/i.test(migration), 'migration adds no direct table RLS access')
check(page.includes('authority.effectiveAreas.logistics') && page.includes('SharedV3LogisticsWorkspace'), 'shared branch receives resolved Logistics authority')
check(shared.indexOf('if (level === 0) return null') < shared.indexOf('function EnabledSharedV3LogisticsWorkspace')
  && shared.slice(shared.indexOf('function EnabledSharedV3LogisticsWorkspace')).includes('const logistics = useQuery'), 'level zero never mounts the Logistics query')
check(shared.includes("const key = ['collaborative-logistics-v3', userId, wedding.id, accessVersion]"), 'shared cache key is actor/wedding/access-version scoped')
check(shared.includes("searchParams.get('tab') === 'wedding_day'") && shared.includes("params.set('tab', 'wedding_day')"), 'canonical Logistics tab deep link resolves in shared branch')
check(!shared.includes('useWeddingDetailHost') && !shared.includes('useModernWeddingDetailContext') && !shared.includes('travelService.'), 'shared adapter does not mount owner detail or route query graph')
check(!shared.includes("from '@/features/weddings/detail/editing/fields/LocationRoleFields'"), 'shared adapter imports presentation without owner query/write adapter')
check(!shared.includes('get_collaborative_wedding_detail'), 'shared adapter does not call broad legacy detail RPC')
check(ownerLogistics.includes('travelService.getPlan') && ownerLogistics.includes('travelService.recalculate'), 'owner retains existing route query and recalculation adapter')
check(ownerLogistics.includes('CanonicalWeddingLogisticsPresentation'), 'owner and shared adapters use the canonical Logistics presentation')
check(shared.includes('level >= 2 ? () => setEditorVersion(accessVersion) : undefined'), 'edit affordance is absent at level one')
check(shared.includes('level >= 2') && shared.includes('onRecalculate'), 'edit level supplies place and route actions')
check(shared.includes('addressVersion') && shared.includes('nameVersion'), 'place writes submit both field generations')
check(authority.includes("['collaborative-logistics-v3', userId, weddingId]"), 'access loss evicts shared Logistics projection')
check(shared.includes('selectCanonicalLogisticsPlace(current.places, role)'), 'save targets the canonical row selected by the form')
check(migration.includes('select p.id into v_selected_place_id') && migration.includes("if v_selected_place_id is distinct from v_place_id"), 'server rejects attempts to mutate a non-selected duplicate sibling')

const weddingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const keys = (value: Record<string, unknown>) => Object.keys(value)
const segment = { id:'s', wedding_id:weddingId, sequence:0, origin_kind:'studio', origin_wedding_place_id:null,
  destination_kind:'wedding_place', destination_wedding_place_id:'p', endpoints_hash:'h', distance_meters:1,
  distance_text:'1 m', duration_seconds:2, duration_text:'1 min', travel_mode:'DRIVE', provider:'google',
  status:'ok', error_message:null, calculated_at:null, created_at:'', updated_at:'' }
const projection = { wedding_id:weddingId, access_version:'2', logistics_level:1, route_contract_version:1,
  provider:'google', travel_mode:'DRIVE', wedding_route_input_version:'1', studio_origin_version:'1', topology_token:'a'.repeat(64),
  route_stale:false, places:[], studio:null, route_stops:[], route_topology:[], segments:[] }
check(keys(projection).length === 15, 'projection fixture includes exact allowlisted root fields')
check(parseCollaborativeLogisticsProjection(projection, weddingId).logistics_level === 1, 'strict parser accepts valid level-one response')
check(parseCollaborativeLogisticsProjection({...projection, logistics_level:2}, weddingId).logistics_level === 2, 'strict parser accepts valid level-two response')
const makePlace = (id: string, role: 'bride_preparation' | 'preparation' | 'ceremony', sortOrder: number, createdAt: string) => ({
  id, weddingId: 'w', role, label: id, placeId: null, formattedAddress: '', latitude: null,
  longitude: null, sortOrder, createdAt, updatedAt: '',
} as const)
check(selectCanonicalLogisticsPlace([makePlace('canonical', 'bride_preparation', 20, '2')], 'bride_preparation')?.id === 'canonical', 'canonical preparation-only fixture selects canonical row')
check(selectCanonicalLogisticsPlace([makePlace('legacy', 'preparation', 10, '1')], 'bride_preparation')?.id === 'legacy', 'legacy preparation-only fixture preserves legacy row selection')
check(selectCanonicalLogisticsPlace([makePlace('legacy', 'preparation', 1, '1'), makePlace('canonical', 'bride_preparation', 30, '2')], 'bride_preparation')?.id === 'canonical', 'canonical preparation wins over legacy preparation')
check(selectCanonicalLogisticsPlace([makePlace('later', 'ceremony', 20, '2'), makePlace('first', 'ceremony', 10, '1')], 'ceremony')?.id === 'first', 'duplicate historical rows select stable owner sort-order row')
check(selectCanonicalLogisticsPlace([makePlace('z-row', 'ceremony', 10, '1'), makePlace('a-row', 'ceremony', 10, '1')], 'ceremony')?.id === 'a-row', 'equal duplicate rows use stable ID tie-breaker')
check(shared.includes('const place = selectCanonicalLogisticsPlace(places, role)'), 'form projection displays exactly the row mutation selection will target')
assert.throws(() => parseCollaborativeLogisticsProjection({...projection, payments:[]}, weddingId), /UNKNOWN/); assertions++
assert.throws(() => parseCollaborativeLogisticsProjection({...projection, wedding_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}, weddingId), /UNKNOWN/); assertions++
assert.throws(() => parseCollaborativeLogisticsProjection({...projection, segments:[{...segment, commercial_fee:99}]}, weddingId), /UNKNOWN/); assertions++
assert.throws(() => parseCollaborativeLogisticsProjection({...projection, studio:{...{
  studio_name:null,street:null,building_number:null,postal_code:null,city:null,country:'PL',formatted_address:null,latitude:null,longitude:null,place_id:null,
},free_distance_km:50}}, weddingId), /UNKNOWN/); assertions++
assert.throws(() => parseCollaborativeLogisticsProjection({...projection, topology_token:'bad'}, weddingId), /UNKNOWN/); assertions++

console.log(`PASS collaboration V3 Logistics acceptance — ${assertions} assertions`)
