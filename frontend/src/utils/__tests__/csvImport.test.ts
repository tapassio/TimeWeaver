import assert from 'node:assert'
import { parseCsv, detectDelimiter } from '../csvParser'
import { autoMapColumns, IMPORT_CONFIGS, applyColumnMapping } from '../csvSchemas'
import { parseImportText } from '../csvSchemas'
import type { Room } from '../../types/room'
import type { Location } from '../../types/location'

console.log('--- Starting CSV Import Unit Tests (TimeWeaver: rooms/locations) ---')

// 1. Delimiter Detection
assert.strictEqual(detectDelimiter('name,building,campus'), ',')
assert.strictEqual(detectDelimiter('name;building;campus'), ';')
assert.strictEqual(detectDelimiter('name\tbuilding\tcampus'), '\t')
console.log('✓ Delimiter detection passed')

// 2. Test Rooms mapping & transformation
const roomCsv = `name,room_number,floor,room_type,capacity_seats,equipment_projector,accessibility_step_free_access
Lab 101,101,1,computer_lab,30,true,true`
const roomParsed = parseCsv(roomCsv)
const roomConfig = IMPORT_CONFIGS.rooms
const roomMapping = autoMapColumns(roomParsed.headers, roomConfig.fields)
assert.strictEqual(roomMapping.name, 'name')
assert.strictEqual(roomMapping.room_number, 'room_number')
assert.strictEqual(roomMapping.capacity_seats, 'capacity_seats')

const roomMappedRows = applyColumnMapping(roomParsed.rows, roomConfig.fields, roomMapping)
const rooms = roomConfig.transform(roomMappedRows) as Room[]
assert.strictEqual(rooms.length, 1)
assert.strictEqual(rooms[0]!.name, 'Lab 101')
assert.strictEqual(rooms[0]!.roomNumber, '101')
assert.strictEqual(rooms[0]!.roomType, 'computer_lab')
assert.strictEqual(rooms[0]!.capacity, 30)
assert.strictEqual(rooms[0]!.floor, 1)
console.log('✓ Room mapping and transformation passed')

// 3. Test Locations mapping & transformation
const locCsv = `Name,Campus,Building,Address,Latitude,Longitude
Main Building,North Campus,Building A,Street 1,52.5201,13.4049`
const locParsed = parseCsv(locCsv)
const locConfig = IMPORT_CONFIGS.locations
const locMapping = autoMapColumns(locParsed.headers, locConfig.fields)
assert.strictEqual(locMapping.name, 'Name')
assert.strictEqual(locMapping.campus, 'Campus')
const locMappedRows = applyColumnMapping(locParsed.rows, locConfig.fields, locMapping)
const locations = locConfig.transform(locMappedRows) as Location[]
assert.strictEqual(locations.length, 1)
assert.strictEqual(locations[0]!.name, 'Main Building')
assert.strictEqual(locations[0]!.building, 'Building A')
assert.strictEqual(locations[0]!.latitude, 52.5201)
console.log('✓ Location mapping and transformation passed')

// 4. Test Headerless CSV parsing
const headerlessCsv = `Auditorium Maximum,AUD-100,0,lecture_hall,250
Lab Beta,B-201,2,computer_lab,40`
const headerlessParsed = parseCsv(headerlessCsv, { hasHeader: false })
assert.strictEqual(headerlessParsed.headers.length, 5)
assert.strictEqual(headerlessParsed.rows.length, 2)
assert.strictEqual(headerlessParsed.rows[0]!['Column 1'], 'Auditorium Maximum')
console.log('✓ Headerless CSV parsing passed')

// 5. parseImportText central routing (rooms)
const roomsFromText = parseImportText('rooms', 'name,room_number,floor,room_type,capacity_seats\nLab 2,B12,1,computer_lab,30')
assert.strictEqual(roomsFromText.length, 1)
assert.strictEqual((roomsFromText[0] as any).name, 'Lab 2')
assert.strictEqual((roomsFromText[0] as any).capacity, 30)

const locationsFromText = parseImportText('locations', 'name,campus,building\nMain Wing,West,B')
assert.strictEqual(locationsFromText.length, 1)
assert.strictEqual((locationsFromText[0] as any).name, 'Main Wing')
assert.strictEqual((locationsFromText[0] as any).building, 'B')
console.log('✓ parseImportText central routing passed')

console.log('--- All CSV Import Unit Tests Passed Successfully ---')
