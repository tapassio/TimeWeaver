# Classroom Data Export Format

This document defines the JSON format for exporting classroom information for semester planning.

The export should contain one JSON object per classroom in a top-level array.

## 1. File format

- **Format:** JSON
- **Character encoding:** UTF-8
- **File extension:** `.json`
- **Top-level structure:** Array of classroom objects
- **Date format:** ISO 8601, for example `2026-09-14`, except for yearly repeating dates where MM-DD is used.
- **Time format:** 24-hour `HH:mm`, for example `08:00`
- **Boolean values:** `true` or `false`
- **Missing values:** Use `null`; do not use empty strings such as `""`
- **Units:**
  - Floor area: square metres
  - Network speed: megabits per second
  - Capacity: number of people or seats

## 2. Field requirements

### Required fields

The following fields should be provided for every classroom:

| Field | Type | Description |
|---|---|---|
| `name` | string | Human-readable room name |
| `floor` | integer or string | Floor number or label |
| `roomNumber` | string | Room number within the building |
| `locationId` | string | Reference to a Location object |
| `roomType` | string | Type of classroom |
| `capacity` | integer | Maximum number of regular seats |
| `accessibility.step_free_access` | boolean | Whether the room has step-free access |

All other fields are optional, but should be included where the information is available.

## 3. Classroom object

```json
{
  "name": "Science Building 204",
  "roomType": "classroom",
  "floor": 2,
  "roomNumber": "204",
  "locationId": "loc_abc123",

  "capacity": 36,
  "layout": {},
  "equipment": {},
  "connectivity": {},
  "accessibility": {},
  "maintenance": {}
}
```

## 4. Identity and classification

| Field | Type | Required | Description |
|---|---|---:|---|
| `name` | string | Yes | Human-readable name, such as `Science Building 204`. |
| `floor` | integer or string | Yes | Floor number or label, such as `2`, `0`, or `"basement"`. |
| `roomNumber` | string | Yes | Official room number or designation. |
| `locationId` | string | No | Reference to a Location object. |
| `roomType` | string | Yes | General room category. |
| `owner` | string | No | Contact person responsible for the room. |

Values for `roomType` include:

- `lecture_hall`
- `classroom`
- `computer_lab`
- `laboratory`
- `other`

Use `other` if no predefined value is appropriate.

## 5. Capacity

```json
"capacity": 36
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `capacity` | integer | Yes | Maximum number of normal seats. |

The value of `capacity` should represent the normal approved teaching capacity.

## 6. Layout and furniture

```json
"layout": {
  "type": "flexible",
  "movable_desks": true,
  "movable_chairs": true,
  "group_work_possible": true,
  "floor_area_m2": 58
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `layout.type` | string | No | Main seating arrangement or layout category. |
| `layout.movable_desks` | boolean | No | Whether desks can be rearranged. |
| `layout.movable_chairs` | boolean | No | Whether chairs can be rearranged. |
| `layout.group_work_possible` | boolean | No | Whether the room supports group work or collaborative seating. |
| `layout.floor_area_m2` | number | No | Approximate usable floor area in square metres. |

Recommended values for `layout.type` include:

- `rows`
- `u_shape`
- `boardroom`
- `laboratory_benches`
- `computer_workstations`
- `other`

## 7. Equipment

```json
"equipment": {
  "whiteboards": 2,
  "blackboard": false,
  "flipchart": true,
  "smartboard": true,
  "projector": true,
  "projector_count": 1,
  "display_type": "projector",
  "document_camera": false,
  "lectern": true,
  "speakers": true,
  "microphone": false,

  "streaming_camera": {
    "available": true,
    "type": "tracking",
    "position": "front_wall",
    "quality": "1080p"
  },

  "lecture_capture": true,

  "video_conferencing": {
    "available": true,
    "system": "integrated",
    "supports_remote_participants": true
  }
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `equipment.whiteboards` | integer | Yes | Number of usable whiteboards. Use `0` if none are available. |
| `equipment.blackboard` | boolean | No | Whether a blackboard is available. |
| `equipment.flipchart` | boolean | Yes | Whether a flipchart stand is available. |
| `equipment.smartboard` | boolean | No | Whether an interactive digital board is available. |
| `equipment.projector` | boolean | Yes | Whether at least one projector is available. |
| `equipment.projector_count` | integer | No | Number of projectors. |
| `equipment.display_type` | string or array | No | Available display types. |
| `equipment.document_camera` | boolean | No | Whether a document camera is available. |
| `equipment.lectern` | boolean | No | Whether a lectern or presentation desk is available. |
| `equipment.speakers` | boolean | No | Whether installed speakers are available. |
| `equipment.microphone` | boolean | No | Whether a microphone is available. |
| `equipment.lecture_capture` | boolean | No | Whether the room supports lecture recording. |
| `equipment.streaming_camera` | object | Yes | Streaming-camera information. |
| `equipment.video_conferencing` | object | No | Video-conferencing information. |

### Streaming camera

The `streaming_camera` field must be an object rather than only a Boolean, so that camera capabilities can be distinguished.

| Field | Type | Required | Description |
|---|---|---:|---|
| `available` | boolean | Yes | Whether a streaming camera is available. |
| `type` | string | No | Camera type, such as `fixed`, `tracking`, or `pan_tilt_zoom`. |
| `position` | string | No | Approximate camera position. |
| `quality` | string | No | Resolution or quality, such as `720p`, `1080p`, or `4k`. |

Example:

```json
"streaming_camera": {
  "available": true,
  "type": "tracking",
  "position": "front_wall",
  "quality": "1080p"
}
```

### Video conferencing

```json
"video_conferencing": {
  "available": true,
  "system": "integrated",
  "supports_remote_participants": true
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `available` | boolean | Yes | Whether video conferencing is supported. |
| `system` | string | No | Type or installed system. Avoid provider-specific assumptions if not necessary. |
| `supports_remote_participants` | boolean | No | Whether remote students or instructors can participate interactively. |

## 8. Connectivity

```json
"connectivity": {
  "wifi": true,
  "wired_network": true,
  "network_speed_mbps": 1000,
  "power_outlets": 18,
  "connections": ["HDMI", "USB-C", "DisplayPort"],
  "wireless_presentation": true
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `connectivity.wifi` | boolean | No | Whether Wi-Fi is available. |
| `connectivity.wired_network` | boolean | No | Whether wired network connections are available. |
| `connectivity.network_speed_mbps` | integer | No | Nominal network speed in megabits per second. |
| `connectivity.power_outlets` | integer | No | Number of usable power outlets. |
| `connectivity.connections` | array of strings | No | Available physical connection types. |
| `connectivity.wireless_presentation` | boolean | No | Whether wireless screen sharing is available. |

Recommended connection values include:

- `HDMI`
- `DisplayPort`
- `USB-C`
- `VGA`
- `3.5mm_audio`
- `Ethernet`

## 9. Accessibility

```json
"accessibility": {
  "step_free_access": true,
  "accessible_door": true,
  "accessible_seating": true,
  "hearing_loop": false,
  "braille_signage": false,
  "accessible_restrooms_nearby": true
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `accessibility.step_free_access` | boolean | Yes | Whether the room can be reached without stairs. |
| `accessibility.accessible_door` | boolean | No | Whether the door is suitable for wheelchair access. |
| `accessibility.accessible_seating` | boolean | No | Whether accessible seating or wheelchair spaces are available. |
| `accessibility.hearing_loop` | boolean | No | Whether an induction or hearing loop is available. |
| `accessibility.braille_signage` | boolean | No | Whether relevant Braille signage is present. |
| `accessibility.accessible_restrooms_nearby` | boolean | No | Whether accessible restrooms are nearby. |

## 10. Availability

Room availability is stored as separate entities (one per weekday and calendar week), each referencing the room by `roomId`:

```json
{
  "roomId": "room_abc123",
  "weekId": "week_2026_05",
  "weekday": "monday",
  "startTime": "08:00",
  "endTime": "20:00"
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `roomId` | string | Yes | ID of the room this slot belongs to. |
| `weekId` | string | No | Calendar week this slot applies to. |
| `weekday` | string | Yes | Day of the week in lowercase. |
| `startTime` | string | Yes | Start time in `HH:mm` format. |
| `endTime` | string | Yes | End time in `HH:mm` format. |


## 11. Maintenance and data quality

```json
"maintenance": {
  "last_updated": "2026-09-14"
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `maintenance.last_updated` | string | Yes | Date when this classroom record was last updated. |