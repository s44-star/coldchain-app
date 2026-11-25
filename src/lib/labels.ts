/** Display labels for database enums that are not statuses. */
export const WAREHOUSE_TYPES: Record<string, string> = {
  cold_storage: "Cold storage",
  distribution_center: "Distribution centre",
  pharmaceutical: "Pharmaceutical",
  food_processing: "Food processing",
  port_terminal: "Port terminal",
  other: "Other",
};

export const ZONE_TYPES: Record<string, string> = {
  room: "Room",
  refrigerated: "Refrigerated",
  freezer: "Freezer",
  zone: "Other zone",
};

export const SENSOR_TYPES: Record<string, string> = {
  temperature: "Temperature",
  humidity: "Humidity",
  temperature_humidity: "Temperature and humidity",
};

export const ALERT_TYPES: Record<string, string> = {
  temperature_high: "Temperature too high",
  temperature_low: "Temperature too low",
  humidity_high: "Humidity too high",
  humidity_low: "Humidity too low",
  missing_readings: "Missing readings",
  sensor_offline: "Sensor offline",
  maintenance_due: "Maintenance due",
  maintenance_overdue: "Maintenance overdue",
};
