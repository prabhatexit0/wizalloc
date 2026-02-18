use wasm_bindgen::prelude::*;

pub mod storage;

use std::collections::HashMap;
use storage::config::EngineConfig;
use storage::disk::DiskManager;
use storage::buffer_pool::BufferPoolManager;
use storage::table::TableHeap;
use storage::schema::*;
use storage::types::*;
use storage::snapshot;

#[wasm_bindgen]
pub struct StorageEngine {
    config: EngineConfig,
    bpm: BufferPoolManager,
    tables: HashMap<String, TableHeap>,
}

#[wasm_bindgen]
impl StorageEngine {
    /// Create a new storage engine with the given configuration JSON.
    ///
    /// Config JSON format:
    /// ```json
    /// { "page_size": 128, "pool_size": 8, "disk_capacity": 64, "overflow_threshold": 64 }
    /// ```
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<StorageEngine, JsValue> {
        let mut config: EngineConfig = parse_config(config_json)
            .map_err(|e| JsValue::from_str(&e))?;
        config.validate().map_err(|e| JsValue::from_str(&e))?;

        let disk = DiskManager::new(config.page_size, config.disk_capacity);
        let bpm = BufferPoolManager::new(config.pool_size, disk);

        Ok(Self {
            config,
            bpm,
            tables: HashMap::new(),
        })
    }

    /// Get the current engine configuration as JSON.
    pub fn config(&self) -> String {
        format!(
            r#"{{"page_size":{},"pool_size":{},"disk_capacity":{},"overflow_threshold":{}}}"#,
            self.config.page_size,
            self.config.pool_size,
            self.config.disk_capacity,
            self.config.overflow_threshold
        )
    }

    /// Create a table. Schema JSON:
    /// ```json
    /// { "columns": [
    ///     { "name": "id", "type": "Int32", "nullable": false },
    ///     { "name": "name", "type": { "VarChar": 255 }, "nullable": true }
    /// ]}
    /// ```
    pub fn create_table(&mut self, name: &str, schema_json: &str) -> Result<bool, JsValue> {
        if self.tables.contains_key(name) {
            return Err(JsValue::from_str(&format!("Table '{}' already exists", name)));
        }

        let schema = parse_schema(schema_json)
            .map_err(|e| JsValue::from_str(&e))?;

        let table = TableHeap::create(
            name.to_string(),
            schema,
            self.config.overflow_threshold,
            &mut self.bpm,
        ).ok_or_else(|| JsValue::from_str("Failed to allocate page for table"))?;

        self.tables.insert(name.to_string(), table);
        Ok(true)
    }

    /// Drop a table and free its pages.
    pub fn drop_table(&mut self, name: &str) -> bool {
        if let Some(table) = self.tables.remove(name) {
            let page_ids = table.page_ids(&mut self.bpm);
            for pid in page_ids {
                self.bpm.delete_page(pid);
            }
            true
        } else {
            false
        }
    }

    /// List table names as JSON array.
    pub fn list_tables(&self) -> String {
        let names: Vec<String> = self.tables.keys()
            .map(|k| format!("\"{}\"", k))
            .collect();
        format!("[{}]", names.join(","))
    }

    /// Insert a row. Values JSON:
    /// ```json
    /// [42, "Alice", 3.14, true, null]
    /// ```
    /// Returns RowId as "page_id:slot_id" string.
    pub fn insert(&mut self, table_name: &str, values_json: &str) -> Result<String, JsValue> {
        let table = self.tables.get(table_name)
            .ok_or_else(|| JsValue::from_str(&format!("Table '{}' not found", table_name)))?;
        let schema = table.schema.clone();

        let values = parse_values(values_json, &schema)
            .map_err(|e| JsValue::from_str(&e))?;

        let table = self.tables.get_mut(table_name).unwrap();
        let row_id = table.insert(&mut self.bpm, &values)
            .ok_or_else(|| JsValue::from_str("Insert failed: no space"))?;

        Ok(format!("{}:{}", row_id.page_id, row_id.slot_id))
    }

    /// Get a row by "page_id:slot_id". Returns values as JSON array.
    pub fn get(&mut self, table_name: &str, row_id_str: &str) -> Result<String, JsValue> {
        let row_id = parse_row_id(row_id_str)
            .map_err(|e| JsValue::from_str(&e))?;
        let table = self.tables.get(table_name)
            .ok_or_else(|| JsValue::from_str(&format!("Table '{}' not found", table_name)))?;

        let values = table.get(&mut self.bpm, row_id)
            .ok_or_else(|| JsValue::from_str("Row not found"))?;

        Ok(values_to_json(&values))
    }

    /// Delete a row by "page_id:slot_id".
    pub fn delete(&mut self, table_name: &str, row_id_str: &str) -> Result<bool, JsValue> {
        let row_id = parse_row_id(row_id_str)
            .map_err(|e| JsValue::from_str(&e))?;
        let table = self.tables.get_mut(table_name)
            .ok_or_else(|| JsValue::from_str(&format!("Table '{}' not found", table_name)))?;

        Ok(table.delete(&mut self.bpm, row_id))
    }

    /// Scan all rows. Returns JSON array of { "row_id": "p:s", "values": [...] }.
    pub fn scan(&mut self, table_name: &str) -> Result<String, JsValue> {
        let table = self.tables.get(table_name)
            .ok_or_else(|| JsValue::from_str(&format!("Table '{}' not found", table_name)))?;

        let rows = table.scan(&mut self.bpm);

        let mut entries: Vec<String> = Vec::new();
        for (row_id, values) in &rows {
            entries.push(format!(
                r#"{{"row_id":"{}:{}","values":{}}}"#,
                row_id.page_id, row_id.slot_id, values_to_json(values)
            ));
        }
        Ok(format!("[{}]", entries.join(",")))
    }

    // ── Snapshot methods for visualization ──────────────────────────

    /// Snapshot the buffer pool state as binary.
    pub fn snapshot_buffer_pool(&self) -> Vec<u8> {
        snapshot::snapshot_buffer_pool(&self.bpm)
    }

    /// Snapshot disk overview as binary.
    pub fn snapshot_disk(&self) -> Vec<u8> {
        snapshot::snapshot_disk(&self.bpm)
    }

    /// Snapshot a single page's details as binary.
    pub fn snapshot_page(&mut self, page_id: u32) -> Option<Vec<u8>> {
        snapshot::snapshot_page(&mut self.bpm, page_id)
    }

    /// Snapshot table metadata as binary.
    pub fn snapshot_table(&mut self, table_name: &str) -> Option<Vec<u8>> {
        let table = self.tables.get(table_name)?;
        let page_ids = table.page_ids(&mut self.bpm);
        let schema = table.schema.clone();
        let table = self.tables.get(table_name)?;
        Some(snapshot::snapshot_table(
            &table.name,
            &schema,
            table.first_page_id,
            table.row_count,
            &page_ids,
        ))
    }

    /// Get table schema as JSON for the frontend.
    pub fn table_schema(&self, table_name: &str) -> Option<String> {
        let table = self.tables.get(table_name)?;
        Some(schema_to_json(&table.schema))
    }

    /// Flush all dirty pages in the buffer pool.
    pub fn flush_all(&mut self) {
        self.bpm.flush_all();
    }

    /// Flush a specific page.
    pub fn flush_page(&mut self, page_id: u32) -> bool {
        self.bpm.flush_page(page_id)
    }
}

// ── JSON parsing helpers (minimal, no serde dependency) ────────────

fn parse_config(json: &str) -> Result<EngineConfig, String> {
    let json = json.trim();
    let mut config = EngineConfig::default_config();

    if let Some(v) = extract_u32(json, "page_size") { config.page_size = v; }
    if let Some(v) = extract_u32(json, "pool_size") { config.pool_size = v; }
    if let Some(v) = extract_u32(json, "disk_capacity") { config.disk_capacity = v; }
    if let Some(v) = extract_u32(json, "overflow_threshold") { config.overflow_threshold = v; }

    Ok(config)
}

fn extract_u32(json: &str, key: &str) -> Option<u32> {
    let pattern = format!("\"{}\"", key);
    let idx = json.find(&pattern)?;
    let rest = &json[idx + pattern.len()..];
    let colon = rest.find(':')?;
    let after_colon = rest[colon + 1..].trim_start();
    let end = after_colon.find(|c: char| !c.is_ascii_digit())
        .unwrap_or(after_colon.len());
    after_colon[..end].parse().ok()
}

fn parse_schema(json: &str) -> Result<Schema, String> {
    // Parse a simple JSON schema format
    // Look for "columns" array
    let columns_start = json.find("\"columns\"")
        .ok_or("Missing 'columns' key")?;
    let rest = &json[columns_start..];
    let arr_start = rest.find('[').ok_or("Missing columns array")?;
    let arr_end = find_matching_bracket(rest, arr_start).ok_or("Malformed columns array")?;
    let arr = &rest[arr_start + 1..arr_end];

    let mut columns = Vec::new();
    let mut pos = 0;
    while pos < arr.len() {
        if let Some(obj_start) = arr[pos..].find('{') {
            let abs_start = pos + obj_start;
            let obj_end = find_matching_brace(arr, abs_start)
                .ok_or("Malformed column object")?;
            let obj = &arr[abs_start..=obj_end];
            columns.push(parse_column(obj)?);
            pos = obj_end + 1;
        } else {
            break;
        }
    }

    if columns.is_empty() {
        return Err("Schema must have at least one column".into());
    }
    Ok(Schema::new(columns))
}

fn parse_column(json: &str) -> Result<Column, String> {
    let name = extract_string(json, "name").ok_or("Missing column name")?;
    let nullable = extract_bool(json, "nullable").unwrap_or(false);

    // Type can be a string like "Int32" or an object like {"VarChar": 255}
    let type_idx = json.find("\"type\"").ok_or("Missing column type")?;
    let rest = &json[type_idx + 6..];
    let colon = rest.find(':').ok_or("Missing colon after type")?;
    let after_colon = rest[colon + 1..].trim_start();

    let col_type = if after_colon.starts_with('"') {
        // Simple type string
        let end = after_colon[1..].find('"').ok_or("Malformed type string")?;
        let type_str = &after_colon[1..1 + end];
        match type_str {
            "Int32" => ColumnType::Int32,
            "UInt32" => ColumnType::UInt32,
            "Float64" => ColumnType::Float64,
            "Bool" => ColumnType::Bool,
            _ => return Err(format!("Unknown type: {}", type_str)),
        }
    } else if after_colon.starts_with('{') {
        // Object type like {"VarChar": 255}
        let end = after_colon.find('}').ok_or("Malformed type object")?;
        let inner = &after_colon[1..end];
        if inner.contains("VarChar") {
            let max = extract_number_after_colon(inner).unwrap_or(255);
            ColumnType::VarChar(max as u16)
        } else if inner.contains("Blob") {
            let max = extract_number_after_colon(inner).unwrap_or(255);
            ColumnType::Blob(max as u16)
        } else {
            return Err("Unknown type object".into());
        }
    } else {
        return Err("Could not parse column type".into());
    };

    Ok(Column { name, col_type, nullable })
}

fn parse_values(json: &str, schema: &Schema) -> Result<Vec<Value>, String> {
    let json = json.trim();
    if !json.starts_with('[') || !json.ends_with(']') {
        return Err("Values must be a JSON array".into());
    }
    let inner = &json[1..json.len() - 1];

    let parts = split_json_array(inner);
    if parts.len() != schema.columns.len() {
        return Err(format!(
            "Expected {} values, got {}", schema.columns.len(), parts.len()
        ));
    }

    let mut values = Vec::new();
    for (i, part) in parts.iter().enumerate() {
        let part = part.trim();
        let col = &schema.columns[i];

        if part == "null" {
            if !col.nullable {
                return Err(format!("Column '{}' is not nullable", col.name));
            }
            values.push(Value::Null);
            continue;
        }

        let val = match &col.col_type {
            ColumnType::Int32 => {
                let v: i32 = part.parse().map_err(|_| format!("Invalid Int32: {}", part))?;
                Value::Int32(v)
            }
            ColumnType::UInt32 => {
                let v: u32 = part.parse().map_err(|_| format!("Invalid UInt32: {}", part))?;
                Value::UInt32(v)
            }
            ColumnType::Float64 => {
                let v: f64 = part.parse().map_err(|_| format!("Invalid Float64: {}", part))?;
                Value::Float64(v)
            }
            ColumnType::Bool => {
                let v = match part {
                    "true" => true,
                    "false" => false,
                    _ => return Err(format!("Invalid Bool: {}", part)),
                };
                Value::Bool(v)
            }
            ColumnType::VarChar(_) => {
                if part.starts_with('"') && part.ends_with('"') {
                    Value::VarChar(unescape_json_string(&part[1..part.len() - 1]))
                } else {
                    return Err(format!("VarChar must be a string: {}", part));
                }
            }
            ColumnType::Blob(_) => {
                if part.starts_with('"') && part.ends_with('"') {
                    Value::Blob(part[1..part.len() - 1].as_bytes().to_vec())
                } else {
                    return Err(format!("Blob must be a string: {}", part));
                }
            }
        };
        values.push(val);
    }

    Ok(values)
}

fn parse_row_id(s: &str) -> Result<RowId, String> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return Err("RowId format: page_id:slot_id".into());
    }
    let page_id: PageId = parts[0].parse().map_err(|_| "Invalid page_id")?;
    let slot_id: SlotId = parts[1].parse().map_err(|_| "Invalid slot_id")?;
    Ok(RowId { page_id, slot_id })
}

fn values_to_json(values: &[Value]) -> String {
    let parts: Vec<String> = values.iter().map(|v| match v {
        Value::Int32(n) => n.to_string(),
        Value::UInt32(n) => n.to_string(),
        Value::Float64(n) => format!("{}", n),
        Value::Bool(b) => b.to_string(),
        Value::VarChar(s) => format!("\"{}\"", escape_json_string(s)),
        Value::Blob(b) => {
            let hex: String = b.iter().map(|byte| format!("{:02x}", byte)).collect();
            format!("\"0x{}\"", hex)
        }
        Value::Null => "null".into(),
    }).collect();
    format!("[{}]", parts.join(","))
}

fn schema_to_json(schema: &Schema) -> String {
    let cols: Vec<String> = schema.columns.iter().map(|c| {
        let type_str = match &c.col_type {
            ColumnType::Int32 => "\"Int32\"".into(),
            ColumnType::UInt32 => "\"UInt32\"".into(),
            ColumnType::Float64 => "\"Float64\"".into(),
            ColumnType::Bool => "\"Bool\"".into(),
            ColumnType::VarChar(n) => format!("{{\"VarChar\":{}}}", n),
            ColumnType::Blob(n) => format!("{{\"Blob\":{}}}", n),
        };
        format!(
            r#"{{"name":"{}","type":{},"nullable":{}}}"#,
            c.name, type_str, c.nullable
        )
    }).collect();
    format!(r#"{{"columns":[{}]}}"#, cols.join(","))
}

// ── JSON utility helpers ───────────────────────────────────────────

fn extract_string(json: &str, key: &str) -> Option<String> {
    let pattern = format!("\"{}\"", key);
    let idx = json.find(&pattern)?;
    let rest = &json[idx + pattern.len()..];
    let colon = rest.find(':')?;
    let after_colon = rest[colon + 1..].trim_start();
    if !after_colon.starts_with('"') { return None; }
    let end = after_colon[1..].find('"')?;
    Some(unescape_json_string(&after_colon[1..1 + end]))
}

fn extract_bool(json: &str, key: &str) -> Option<bool> {
    let pattern = format!("\"{}\"", key);
    let idx = json.find(&pattern)?;
    let rest = &json[idx + pattern.len()..];
    let colon = rest.find(':')?;
    let after_colon = rest[colon + 1..].trim_start();
    if after_colon.starts_with("true") { Some(true) }
    else if after_colon.starts_with("false") { Some(false) }
    else { None }
}

fn extract_number_after_colon(s: &str) -> Option<u32> {
    let colon = s.find(':')?;
    let after = s[colon + 1..].trim();
    let end = after.find(|c: char| !c.is_ascii_digit()).unwrap_or(after.len());
    after[..end].parse().ok()
}

fn find_matching_bracket(s: &str, start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 0;
    for i in start..bytes.len() {
        match bytes[i] {
            b'[' => depth += 1,
            b']' => { depth -= 1; if depth == 0 { return Some(i); } }
            _ => {}
        }
    }
    None
}

fn find_matching_brace(s: &str, start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 0;
    for i in start..bytes.len() {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => { depth -= 1; if depth == 0 { return Some(i); } }
            _ => {}
        }
    }
    None
}

fn split_json_array(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut current = String::new();
    let mut in_string = false;
    let mut escape = false;

    for ch in s.chars() {
        if escape {
            current.push(ch);
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            current.push(ch);
            escape = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            current.push(ch);
            continue;
        }
        if in_string {
            current.push(ch);
            continue;
        }
        match ch {
            '{' | '[' => { depth += 1; current.push(ch); }
            '}' | ']' => { depth -= 1; current.push(ch); }
            ',' if depth == 0 => {
                parts.push(current.trim().to_string());
                current = String::new();
            }
            _ => current.push(ch),
        }
    }
    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        parts.push(trimmed);
    }
    parts
}

fn escape_json_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn unescape_json_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('"') => result.push('"'),
                Some('\\') => result.push('\\'),
                Some('n') => result.push('\n'),
                Some('r') => result.push('\r'),
                Some('t') => result.push('\t'),
                Some(c) => { result.push('\\'); result.push(c); }
                None => result.push('\\'),
            }
        } else {
            result.push(ch);
        }
    }
    result
}

