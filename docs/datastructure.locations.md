# Location Data Format

This document defines the JSON format for exporting location information used by the Rooms & Locations screen.

Locations are stored as separate entities and referenced by rooms via `location_id`.

The export should contain one JSON object per location in a top-level array.

## 1. File format

- **Format:** JSON
- **Character encoding:** UTF-8
- **File extension:** `.json`
- **Top-level structure:** Array of location objects

## 2. Location object

```json
{
  "name": "North Campus, Science Building",
  "campus": "North Campus",
  "building": "Science Building",
  "address": "Example Street 12",
  "latitude": 52.5201,
  "longitude": 13.4049
}
```

## 3. Field requirements

| Field | Type | Required | Description |
|---|---|---:|---|
| `name` | string | Yes | Human-readable name for the location. |
| `campus` | string | No | Campus name or code. |
| `building` | string | Yes | Building name or code. |
| `address` | string | No | Postal or street address. |
| `latitude` | number | No | Geographic latitude in decimal degrees (WGS 84). |
| `longitude` | number | No | Geographic longitude in decimal degrees (WGS 84). |

## 4. CSV import format

For CSV import, use the following column headers:

`name`, `campus`, `building`, `address`, `latitude`, `longitude`