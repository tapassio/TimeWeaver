import { app, startServer } from '../index'
import { Server } from 'http'

async function runTests() {
  console.log('Starting Express API Server tests...')
  process.env.NODE_ENV = 'test'
  process.env.JUNIE_TEST = 'true'

  const server = (await startServer(3456)) as Server
  const baseUrl = 'http://localhost:3456/api'

  try {
    // 1. Health check
    console.log('Testing GET /api/health...')
    const healthRes = await fetch(`${baseUrl}/health`)
    if (healthRes.status !== 200) throw new Error(`Health check failed: ${healthRes.status}`)
    const healthData = await healthRes.json()
    console.log('Health data:', healthData)
    if (healthData.status !== 'ok') throw new Error('Health status is not ok')

    // 2. Create room
    console.log('Testing POST /api/rooms...')
    const newRoom = {
      id: 'room_test_1',
      name: 'Auditorium A',
      capacity: 100,
      equipment: ['projector', 'whiteboard'],
    }
    const createRes = await fetch(`${baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRoom),
    })
    if (createRes.status !== 201 && createRes.status !== 200) {
      throw new Error(`Create room failed with status: ${createRes.status}`)
    }
    const createdData = await createRes.json()
    if (createdData.name !== 'Auditorium A') throw new Error('Room name mismatch')

    // 3. Get all rooms
    console.log('Testing GET /api/rooms...')
    const listRes = await fetch(`${baseUrl}/rooms`)
    const rooms = await listRes.json()
    if (!Array.isArray(rooms) || rooms.length === 0) throw new Error('Expected non-empty rooms list')
    if (!rooms.some((r: any) => r.id === 'room_test_1')) throw new Error('Created room not in list')

    // 4. Get room by ID
    console.log('Testing GET /api/rooms/:id...')
    const getRes = await fetch(`${baseUrl}/rooms/room_test_1`)
    if (getRes.status !== 200) throw new Error(`Get room by ID failed: ${getRes.status}`)
    const room = await getRes.json()
    if (room.capacity !== 100) throw new Error('Room capacity mismatch')

    // 5. Update room
    console.log('Testing PUT /api/rooms/:id...')
    const updateRes = await fetch(`${baseUrl}/rooms/room_test_1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newRoom, capacity: 120 }),
    })
    if (updateRes.status !== 200) throw new Error(`Update room failed: ${updateRes.status}`)
    const updated = await updateRes.json()
    if (updated.capacity !== 120) throw new Error('Updated capacity mismatch')

    // 6. Test another entity: competencies
    console.log('Testing POST /api/competencies...')
    const compRes = await fetch(`${baseUrl}/competencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'comp_1', title: 'TypeScript mastery', level: 'M' }),
    })
    if (compRes.status !== 201 && compRes.status !== 200) throw new Error('Create competency failed')

    const compListRes = await fetch(`${baseUrl}/competencies`)
    const comps = await compListRes.json()
    if (!comps.some((c: any) => c.id === 'comp_1')) throw new Error('Competency not found in list')

    // 7. Delete room
    console.log('Testing DELETE /api/rooms/:id...')
    const deleteRes = await fetch(`${baseUrl}/rooms/room_test_1`, {
      method: 'DELETE',
    })
    if (deleteRes.status !== 200 && deleteRes.status !== 204) throw new Error('Delete room failed')

    const getDeletedRes = await fetch(`${baseUrl}/rooms/room_test_1`)
    if (getDeletedRes.status !== 404) throw new Error('Room should be deleted and return 404')

    console.log('All Express REST API tests passed successfully!')
    server.close(() => {
      process.exit(0)
    })
  } catch (err) {
    console.error('Test execution failed:', err)
    server.close(() => {
      process.exit(1)
    })
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
