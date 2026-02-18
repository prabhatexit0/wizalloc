//! Schema definition, column types, and tuple binary encoding/decoding.
//!
//! Tuple binary format (laid out in column order):
//!
//! ```text
//! [null_bitmap: ceil(N/8) bytes]
//! [columns in schema order]:
//!     Int32   → 4 bytes LE
//!     UInt32  → 4 bytes LE
//!     Float64 → 8 bytes LE
//!     Bool    → 1 byte  (0x00 or 0x01)
//!     VarChar → u16 LE length + UTF-8 bytes  (0xFFFF = overflow pointer)
//!     Blob    → u16 LE length + raw bytes     (0xFFFF = overflow pointer)
//!
//! Null values: bit set in null_bitmap.
//!     Fixed-size null: still occupies full column width (zeroed).
//!     Var-size null:   u16 length = 0.
//! ```

use crate::storage::types::PageId;

/// Overflow sentinel: when a VarChar/Blob length prefix is 0xFFFF,
/// the next 8 bytes are an overflow pointer.
pub const OVERFLOW_SENTINEL: u16 = 0xFFFF;

/// An overflow pointer stored inline in a tuple.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OverflowPointer {
    pub page_id: PageId,
    pub total_len: u32,
}

impl OverflowPointer {
    pub const SIZE: usize = 8; // 4 (page_id) + 4 (total_len)

    pub fn encode(&self) -> [u8; 8] {
        let mut out = [0u8; 8];
        out[0..4].copy_from_slice(&self.page_id.to_le_bytes());
        out[4..8].copy_from_slice(&self.total_len.to_le_bytes());
        out
    }

    pub fn decode(data: &[u8]) -> Self {
        Self {
            page_id: u32::from_le_bytes([data[0], data[1], data[2], data[3]]),
            total_len: u32::from_le_bytes([data[4], data[5], data[6], data[7]]),
        }
    }
}

// ── Column types ───────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum ColumnType {
    Int32,
    UInt32,
    Float64,
    Bool,
    VarChar(u16),  // max length in bytes
    Blob(u16),     // max length in bytes
}

impl ColumnType {
    /// Size of the fixed-length portion.  For variable-length types, this is
    /// the minimum inline size (the 2-byte length prefix).
    pub fn fixed_size(&self) -> usize {
        match self {
            ColumnType::Int32 => 4,
            ColumnType::UInt32 => 4,
            ColumnType::Float64 => 8,
            ColumnType::Bool => 1,
            ColumnType::VarChar(_) | ColumnType::Blob(_) => 2, // length prefix
        }
    }

    pub fn is_variable(&self) -> bool {
        matches!(self, ColumnType::VarChar(_) | ColumnType::Blob(_))
    }

    /// Type tag for serialization.
    pub fn type_tag(&self) -> u8 {
        match self {
            ColumnType::Int32 => 0,
            ColumnType::UInt32 => 1,
            ColumnType::Float64 => 2,
            ColumnType::Bool => 3,
            ColumnType::VarChar(_) => 4,
            ColumnType::Blob(_) => 5,
        }
    }
}

// ── Column + Schema ────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Column {
    pub name: String,
    pub col_type: ColumnType,
    pub nullable: bool,
}

#[derive(Debug, Clone)]
pub struct Schema {
    pub columns: Vec<Column>,
}

impl Schema {
    pub fn new(columns: Vec<Column>) -> Self {
        Self { columns }
    }

    pub fn num_columns(&self) -> usize {
        self.columns.len()
    }

    /// Bytes needed for the null bitmap.
    pub fn null_bitmap_size(&self) -> usize {
        (self.columns.len() + 7) / 8
    }

    /// Minimum tuple size (all variable-length fields empty, no nulls).
    pub fn min_tuple_size(&self) -> usize {
        let mut size = self.null_bitmap_size();
        for col in &self.columns {
            size += col.col_type.fixed_size();
        }
        size
    }
}

// ── Values ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int32(i32),
    UInt32(u32),
    Float64(f64),
    Bool(bool),
    VarChar(String),
    Blob(Vec<u8>),
    Null,
}

impl Value {
    /// Byte size this value will occupy in a tuple (excluding overflow).
    pub fn inline_size(&self, col_type: &ColumnType) -> usize {
        match self {
            Value::Int32(_) => 4,
            Value::UInt32(_) => 4,
            Value::Float64(_) => 8,
            Value::Bool(_) => 1,
            Value::VarChar(s) => 2 + s.len(),
            Value::Blob(b) => 2 + b.len(),
            Value::Null => col_type.fixed_size(),
        }
    }
}

// ── Encoding ───────────────────────────────────────────────────────

/// Encode a row of values into tuple bytes according to the schema.
///
/// If a variable-length value exceeds `overflow_threshold`, the caller must
/// handle writing it to overflow pages and pass the overflow pointer here.
/// For simplicity, this function does NOT handle overflow itself — it encodes
/// what it's given.  Use `encode_tuple_with_overflow` for overflow-aware encoding.
pub fn encode_tuple(schema: &Schema, values: &[Value]) -> Vec<u8> {
    assert_eq!(values.len(), schema.columns.len());

    let mut buf = Vec::with_capacity(schema.min_tuple_size());

    // Null bitmap
    let bm_size = schema.null_bitmap_size();
    buf.resize(bm_size, 0u8);
    for (i, val) in values.iter().enumerate() {
        if matches!(val, Value::Null) {
            buf[i / 8] |= 1 << (i % 8);
        }
    }

    // Column data
    for (i, val) in values.iter().enumerate() {
        let col = &schema.columns[i];
        match val {
            Value::Int32(v) => buf.extend_from_slice(&v.to_le_bytes()),
            Value::UInt32(v) => buf.extend_from_slice(&v.to_le_bytes()),
            Value::Float64(v) => buf.extend_from_slice(&v.to_le_bytes()),
            Value::Bool(v) => buf.push(if *v { 1 } else { 0 }),
            Value::VarChar(s) => {
                let bytes = s.as_bytes();
                buf.extend_from_slice(&(bytes.len() as u16).to_le_bytes());
                buf.extend_from_slice(bytes);
            }
            Value::Blob(b) => {
                buf.extend_from_slice(&(b.len() as u16).to_le_bytes());
                buf.extend_from_slice(b);
            }
            Value::Null => {
                // Write zero bytes for the column's fixed size
                match &col.col_type {
                    ColumnType::Int32 | ColumnType::UInt32 => {
                        buf.extend_from_slice(&[0u8; 4]);
                    }
                    ColumnType::Float64 => {
                        buf.extend_from_slice(&[0u8; 8]);
                    }
                    ColumnType::Bool => {
                        buf.push(0);
                    }
                    ColumnType::VarChar(_) | ColumnType::Blob(_) => {
                        buf.extend_from_slice(&0u16.to_le_bytes()); // length = 0
                    }
                }
            }
        }
    }

    buf
}

/// Encode a tuple, replacing large variable-length values with overflow pointers.
/// Returns (encoded_bytes, list of (column_index, raw_data) that need overflow storage).
pub fn encode_tuple_with_overflow(
    schema: &Schema,
    values: &[Value],
    overflow_threshold: u32,
) -> (Vec<u8>, Vec<(usize, Vec<u8>)>) {
    assert_eq!(values.len(), schema.columns.len());

    let mut buf = Vec::with_capacity(schema.min_tuple_size());
    let mut overflows: Vec<(usize, Vec<u8>)> = Vec::new();

    // Null bitmap
    let bm_size = schema.null_bitmap_size();
    buf.resize(bm_size, 0u8);
    for (i, val) in values.iter().enumerate() {
        if matches!(val, Value::Null) {
            buf[i / 8] |= 1 << (i % 8);
        }
    }

    // Column data
    for (i, val) in values.iter().enumerate() {
        let col = &schema.columns[i];
        match val {
            Value::Int32(v) => buf.extend_from_slice(&v.to_le_bytes()),
            Value::UInt32(v) => buf.extend_from_slice(&v.to_le_bytes()),
            Value::Float64(v) => buf.extend_from_slice(&v.to_le_bytes()),
            Value::Bool(v) => buf.push(if *v { 1 } else { 0 }),
            Value::VarChar(s) => {
                let bytes = s.as_bytes();
                if bytes.len() > overflow_threshold as usize {
                    // Mark as overflow: sentinel length + placeholder pointer
                    buf.extend_from_slice(&OVERFLOW_SENTINEL.to_le_bytes());
                    // Placeholder overflow pointer (will be patched by caller)
                    buf.extend_from_slice(&[0u8; OverflowPointer::SIZE]);
                    overflows.push((i, bytes.to_vec()));
                } else {
                    buf.extend_from_slice(&(bytes.len() as u16).to_le_bytes());
                    buf.extend_from_slice(bytes);
                }
            }
            Value::Blob(b) => {
                if b.len() > overflow_threshold as usize {
                    buf.extend_from_slice(&OVERFLOW_SENTINEL.to_le_bytes());
                    buf.extend_from_slice(&[0u8; OverflowPointer::SIZE]);
                    overflows.push((i, b.clone()));
                } else {
                    buf.extend_from_slice(&(b.len() as u16).to_le_bytes());
                    buf.extend_from_slice(b);
                }
            }
            Value::Null => {
                match &col.col_type {
                    ColumnType::Int32 | ColumnType::UInt32 => {
                        buf.extend_from_slice(&[0u8; 4]);
                    }
                    ColumnType::Float64 => {
                        buf.extend_from_slice(&[0u8; 8]);
                    }
                    ColumnType::Bool => buf.push(0),
                    ColumnType::VarChar(_) | ColumnType::Blob(_) => {
                        buf.extend_from_slice(&0u16.to_le_bytes());
                    }
                }
            }
        }
    }

    (buf, overflows)
}

/// Patch an overflow pointer into an already-encoded tuple at the right offset.
/// `col_index` is the schema column, and `ptr` is the resolved overflow pointer.
pub fn patch_overflow_pointer(
    schema: &Schema,
    encoded: &mut [u8],
    col_index: usize,
    ptr: &OverflowPointer,
) {
    // Walk to the column's data offset
    let mut offset = schema.null_bitmap_size();
    for i in 0..col_index {
        let col = &schema.columns[i];
        if !col.col_type.is_variable() {
            offset += col.col_type.fixed_size();
        } else {
            let len = u16::from_le_bytes([encoded[offset], encoded[offset + 1]]);
            offset += 2;
            if len == OVERFLOW_SENTINEL {
                offset += OverflowPointer::SIZE;
            } else {
                offset += len as usize;
            }
        }
    }
    // We're now at the target column. Skip the sentinel u16.
    offset += 2;
    // Write the pointer
    encoded[offset..offset + OverflowPointer::SIZE].copy_from_slice(&ptr.encode());
}

// ── Decoding ───────────────────────────────────────────────────────

/// Decode a tuple from raw bytes.  Overflow pointers are returned as
/// `Value::Blob` containing the raw 8-byte pointer (caller resolves them).
pub fn decode_tuple(schema: &Schema, data: &[u8]) -> Vec<Value> {
    let mut values = Vec::with_capacity(schema.columns.len());
    let bm_size = schema.null_bitmap_size();
    let bitmap = &data[..bm_size];
    let mut offset = bm_size;

    for (i, col) in schema.columns.iter().enumerate() {
        let is_null = (bitmap[i / 8] >> (i % 8)) & 1 == 1;

        if is_null {
            // Skip the column's bytes
            if col.col_type.is_variable() {
                let len = u16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                if len == OVERFLOW_SENTINEL {
                    offset += OverflowPointer::SIZE;
                } else {
                    offset += len as usize;
                }
            } else {
                offset += col.col_type.fixed_size();
            }
            values.push(Value::Null);
            continue;
        }

        match &col.col_type {
            ColumnType::Int32 => {
                let v = i32::from_le_bytes([
                    data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
                ]);
                offset += 4;
                values.push(Value::Int32(v));
            }
            ColumnType::UInt32 => {
                let v = u32::from_le_bytes([
                    data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
                ]);
                offset += 4;
                values.push(Value::UInt32(v));
            }
            ColumnType::Float64 => {
                let v = f64::from_le_bytes([
                    data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
                    data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7],
                ]);
                offset += 8;
                values.push(Value::Float64(v));
            }
            ColumnType::Bool => {
                let v = data[offset] != 0;
                offset += 1;
                values.push(Value::Bool(v));
            }
            ColumnType::VarChar(_) => {
                let len = u16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                if len == OVERFLOW_SENTINEL {
                    // Return the raw overflow pointer as a Blob for caller to resolve
                    let ptr_bytes = data[offset..offset + OverflowPointer::SIZE].to_vec();
                    offset += OverflowPointer::SIZE;
                    values.push(Value::Blob(ptr_bytes)); // caller will resolve
                } else {
                    let s = String::from_utf8_lossy(&data[offset..offset + len as usize]).into_owned();
                    offset += len as usize;
                    values.push(Value::VarChar(s));
                }
            }
            ColumnType::Blob(_) => {
                let len = u16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
                if len == OVERFLOW_SENTINEL {
                    let ptr_bytes = data[offset..offset + OverflowPointer::SIZE].to_vec();
                    offset += OverflowPointer::SIZE;
                    values.push(Value::Blob(ptr_bytes));
                } else {
                    let b = data[offset..offset + len as usize].to_vec();
                    offset += len as usize;
                    values.push(Value::Blob(b));
                }
            }
        }
    }

    values
}

/// Check if a decoded value is an unresolved overflow pointer (raw 8-byte blob).
pub fn is_overflow_placeholder(val: &Value, col: &Column) -> bool {
    matches!(
        (&col.col_type, val),
        (ColumnType::VarChar(_), Value::Blob(b)) if b.len() == OverflowPointer::SIZE
    )
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_schema() -> Schema {
        Schema::new(vec![
            Column { name: "id".into(), col_type: ColumnType::Int32, nullable: false },
            Column { name: "name".into(), col_type: ColumnType::VarChar(255), nullable: false },
            Column { name: "score".into(), col_type: ColumnType::Float64, nullable: true },
            Column { name: "active".into(), col_type: ColumnType::Bool, nullable: false },
        ])
    }

    #[test]
    fn encode_decode_roundtrip() {
        let schema = test_schema();
        let values = vec![
            Value::Int32(42),
            Value::VarChar("Alice".into()),
            Value::Float64(3.14),
            Value::Bool(true),
        ];
        let encoded = encode_tuple(&schema, &values);
        let decoded = decode_tuple(&schema, &encoded);
        assert_eq!(decoded, values);
    }

    #[test]
    fn encode_decode_with_null() {
        let schema = test_schema();
        let values = vec![
            Value::Int32(7),
            Value::VarChar("Bob".into()),
            Value::Null,
            Value::Bool(false),
        ];
        let encoded = encode_tuple(&schema, &values);
        let decoded = decode_tuple(&schema, &encoded);
        assert_eq!(decoded, values);
    }

    #[test]
    fn null_bitmap_encoding() {
        let schema = Schema::new(vec![
            Column { name: "a".into(), col_type: ColumnType::Int32, nullable: true },
            Column { name: "b".into(), col_type: ColumnType::Int32, nullable: true },
            Column { name: "c".into(), col_type: ColumnType::Int32, nullable: true },
        ]);
        let values = vec![Value::Null, Value::Int32(5), Value::Null];
        let encoded = encode_tuple(&schema, &values);
        // Bitmap byte: bits 0 and 2 set = 0b00000101 = 5
        assert_eq!(encoded[0], 5);
    }

    #[test]
    fn overflow_detection() {
        let schema = Schema::new(vec![
            Column { name: "id".into(), col_type: ColumnType::Int32, nullable: false },
            Column { name: "bio".into(), col_type: ColumnType::VarChar(1000), nullable: false },
        ]);
        let big_string = "x".repeat(200);
        let values = vec![Value::Int32(1), Value::VarChar(big_string.clone())];

        let (encoded, overflows) = encode_tuple_with_overflow(&schema, &values, 100);
        assert_eq!(overflows.len(), 1);
        assert_eq!(overflows[0].0, 1); // column index 1
        assert_eq!(overflows[0].1, big_string.as_bytes().to_vec());

        // The encoded tuple should have the overflow sentinel
        // After bitmap (1 byte) + int32 (4 bytes) = offset 5
        let len_prefix = u16::from_le_bytes([encoded[5], encoded[6]]);
        assert_eq!(len_prefix, OVERFLOW_SENTINEL);
    }

    #[test]
    fn patch_overflow() {
        let schema = Schema::new(vec![
            Column { name: "id".into(), col_type: ColumnType::Int32, nullable: false },
            Column { name: "bio".into(), col_type: ColumnType::VarChar(1000), nullable: false },
        ]);
        let values = vec![Value::Int32(1), Value::VarChar("x".repeat(200))];
        let (mut encoded, _) = encode_tuple_with_overflow(&schema, &values, 100);

        let ptr = OverflowPointer { page_id: 42, total_len: 200 };
        patch_overflow_pointer(&schema, &mut encoded, 1, &ptr);

        // Read back: after bitmap(1) + int32(4) + sentinel(2) = offset 7
        let decoded_ptr = OverflowPointer::decode(&encoded[7..15]);
        assert_eq!(decoded_ptr, ptr);
    }
}
