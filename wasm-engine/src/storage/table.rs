//! Table Heap — manages a table as a linked list of data pages.
//!
//! Each table owns a chain of pages.  Insertions go to the last page with
//! enough free space; if none fits, a new page is allocated and appended.

use crate::storage::types::*;
use crate::storage::page;
use crate::storage::schema::*;
use crate::storage::overflow;
use crate::storage::buffer_pool::BufferPoolManager;

/// A table stored as a heap (unordered linked list of pages).
#[derive(Debug, Clone)]
pub struct TableHeap {
    /// Table name.
    pub name: String,
    /// Schema describing the columns.
    pub schema: Schema,
    /// First page in the chain.
    pub first_page_id: PageId,
    /// Number of live rows.
    pub row_count: u32,
    /// Overflow threshold (bytes).
    overflow_threshold: u32,
}

impl TableHeap {
    /// Create a new table, allocating its first page.
    pub fn create(
        name: String,
        schema: Schema,
        overflow_threshold: u32,
        bpm: &mut BufferPoolManager,
    ) -> Option<Self> {
        let (page_id, _frame_id) = bpm.new_page()?;
        bpm.unpin_page(page_id, true);

        Some(Self {
            name,
            schema,
            first_page_id: page_id,
            row_count: 0,
            overflow_threshold,
        })
    }

    /// Insert a row.  Returns the RowId on success.
    pub fn insert(
        &mut self,
        bpm: &mut BufferPoolManager,
        values: &[Value],
    ) -> Option<RowId> {
        // Encode the tuple, handling overflow for large values
        let (mut encoded, overflows) =
            encode_tuple_with_overflow(&self.schema, values, self.overflow_threshold);

        // Write overflow pages and patch pointers
        for (col_idx, data) in &overflows {
            let ptr = overflow::write_overflow(bpm, data)?;
            patch_overflow_pointer(&self.schema, &mut encoded, *col_idx, &ptr);
        }

        // Find a page with enough space
        let mut current_page_id = self.first_page_id;
        let mut prev_page_id = INVALID_PAGE;

        loop {
            let frame_id = bpm.fetch_page(current_page_id)?;
            let free = page::free_space(&bpm.frames[frame_id as usize].data);
            let needed = encoded.len() + SLOT_SIZE; // may need a new slot

            if free >= needed {
                // Insert here
                let slot_id = page::insert_tuple(
                    &mut bpm.frames[frame_id as usize].data,
                    &encoded,
                ).expect("free_space check passed but insert failed");
                bpm.unpin_page(current_page_id, true);
                self.row_count += 1;
                return Some(RowId { page_id: current_page_id, slot_id });
            }

            let next = page::next_page(&bpm.frames[frame_id as usize].data);
            bpm.unpin_page(current_page_id, false);

            if next == INVALID_PAGE {
                prev_page_id = current_page_id;
                break;
            }
            current_page_id = next;
        }

        // No page had space — allocate a new one
        let (new_page_id, new_frame_id) = bpm.new_page()?;

        // Link from previous last page
        if prev_page_id != INVALID_PAGE {
            let prev_fid = bpm.fetch_page(prev_page_id)?;
            page::set_next_page(&mut bpm.frames[prev_fid as usize].data, new_page_id);
            bpm.unpin_page(prev_page_id, true);
        }

        let slot_id = page::insert_tuple(
            &mut bpm.frames[new_frame_id as usize].data,
            &encoded,
        )?;
        bpm.unpin_page(new_page_id, true);
        self.row_count += 1;

        Some(RowId { page_id: new_page_id, slot_id })
    }

    /// Delete a row by RowId.
    pub fn delete(
        &mut self,
        bpm: &mut BufferPoolManager,
        row_id: RowId,
    ) -> bool {
        let Some(frame_id) = bpm.fetch_page(row_id.page_id) else {
            return false;
        };

        // Read the tuple first to find overflow pointers to clean up
        if let Some(tuple_data) = page::get_tuple(&bpm.frames[frame_id as usize].data, row_id.slot_id) {
            let decoded = decode_tuple(&self.schema, tuple_data);
            // Clean up overflows
            for (i, val) in decoded.iter().enumerate() {
                if is_overflow_placeholder(val, &self.schema.columns[i]) {
                    if let Value::Blob(ptr_bytes) = val {
                        let ptr = OverflowPointer::decode(ptr_bytes);
                        bpm.unpin_page(row_id.page_id, false);
                        overflow::delete_overflow(bpm, &ptr);
                        // Re-fetch the frame
                        let refetched = bpm.fetch_page(row_id.page_id);
                        if refetched.is_none() { return false; }
                    }
                }
            }
        }

        // Ensure we have the frame
        let frame_id = match bpm.page_to_frame(row_id.page_id) {
            Some(fid) => fid,
            None => {
                let fid = bpm.fetch_page(row_id.page_id);
                match fid {
                    Some(f) => f,
                    None => return false,
                }
            }
        };

        let ok = page::delete_tuple(&mut bpm.frames[frame_id as usize].data, row_id.slot_id);
        bpm.unpin_page(row_id.page_id, ok);
        if ok {
            self.row_count -= 1;
        }
        ok
    }

    /// Get a single row by RowId.
    pub fn get(
        &self,
        bpm: &mut BufferPoolManager,
        row_id: RowId,
    ) -> Option<Vec<Value>> {
        let frame_id = bpm.fetch_page(row_id.page_id)?;
        let tuple_data = page::get_tuple(&bpm.frames[frame_id as usize].data, row_id.slot_id)?;
        let mut values = decode_tuple(&self.schema, tuple_data);
        bpm.unpin_page(row_id.page_id, false);

        // Resolve overflow pointers
        for (i, val) in values.iter_mut().enumerate() {
            if is_overflow_placeholder(val, &self.schema.columns[i]) {
                if let Value::Blob(ptr_bytes) = val {
                    let ptr = OverflowPointer::decode(ptr_bytes);
                    if let Some(data) = overflow::read_overflow(bpm, &ptr) {
                        match &self.schema.columns[i].col_type {
                            ColumnType::VarChar(_) => {
                                *val = Value::VarChar(
                                    String::from_utf8_lossy(&data).into_owned()
                                );
                            }
                            ColumnType::Blob(_) => {
                                *val = Value::Blob(data);
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        Some(values)
    }

    /// Sequential scan — returns all live rows with their RowIds.
    pub fn scan(
        &self,
        bpm: &mut BufferPoolManager,
    ) -> Vec<(RowId, Vec<Value>)> {
        let mut results = Vec::new();
        let mut current_page_id = self.first_page_id;

        while current_page_id != INVALID_PAGE {
            let Some(frame_id) = bpm.fetch_page(current_page_id) else { break };
            let sc = page::slot_count(&bpm.frames[frame_id as usize].data);

            for slot_id in 0..sc {
                if let Some(tuple_data) =
                    page::get_tuple(&bpm.frames[frame_id as usize].data, slot_id)
                {
                    let values = decode_tuple(&self.schema, tuple_data);
                    let row_id = RowId { page_id: current_page_id, slot_id };
                    results.push((row_id, values));
                }
            }

            let next = page::next_page(&bpm.frames[frame_id as usize].data);
            bpm.unpin_page(current_page_id, false);
            current_page_id = next;
        }

        // Resolve overflow pointers in results
        for (_row_id, values) in results.iter_mut() {
            for (i, val) in values.iter_mut().enumerate() {
                if is_overflow_placeholder(val, &self.schema.columns[i]) {
                    if let Value::Blob(ptr_bytes) = val {
                        let ptr = OverflowPointer::decode(ptr_bytes);
                        if let Some(data) = overflow::read_overflow(bpm, &ptr) {
                            match &self.schema.columns[i].col_type {
                                ColumnType::VarChar(_) => {
                                    *val = Value::VarChar(
                                        String::from_utf8_lossy(&data).into_owned()
                                    );
                                }
                                ColumnType::Blob(_) => {
                                    *val = Value::Blob(data);
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        results
    }

    /// Get the list of page IDs owned by this table.
    pub fn page_ids(&self, bpm: &mut BufferPoolManager) -> Vec<PageId> {
        let mut ids = Vec::new();
        let mut current = self.first_page_id;
        while current != INVALID_PAGE {
            ids.push(current);
            if let Some(fid) = bpm.fetch_page(current) {
                let next = page::next_page(&bpm.frames[fid as usize].data);
                bpm.unpin_page(current, false);
                current = next;
            } else {
                break;
            }
        }
        ids
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::disk::DiskManager;

    fn make_bpm(page_size: u32) -> BufferPoolManager {
        let dm = DiskManager::new(page_size, 64);
        BufferPoolManager::new(16, dm)
    }

    fn test_schema() -> Schema {
        Schema::new(vec![
            Column { name: "id".into(), col_type: ColumnType::Int32, nullable: false },
            Column { name: "name".into(), col_type: ColumnType::VarChar(255), nullable: false },
            Column { name: "active".into(), col_type: ColumnType::Bool, nullable: false },
        ])
    }

    #[test]
    fn create_and_insert() {
        let mut bpm = make_bpm(128);
        let mut table = TableHeap::create(
            "users".into(), test_schema(), 64, &mut bpm
        ).unwrap();

        let row_id = table.insert(&mut bpm, &[
            Value::Int32(1),
            Value::VarChar("Alice".into()),
            Value::Bool(true),
        ]).unwrap();

        assert_eq!(table.row_count, 1);
        assert_eq!(row_id.page_id, table.first_page_id);
        assert_eq!(row_id.slot_id, 0);
    }

    #[test]
    fn insert_and_get() {
        let mut bpm = make_bpm(128);
        let mut table = TableHeap::create(
            "users".into(), test_schema(), 64, &mut bpm
        ).unwrap();

        let row_id = table.insert(&mut bpm, &[
            Value::Int32(42),
            Value::VarChar("Bob".into()),
            Value::Bool(false),
        ]).unwrap();

        let values = table.get(&mut bpm, row_id).unwrap();
        assert_eq!(values[0], Value::Int32(42));
        assert_eq!(values[1], Value::VarChar("Bob".into()));
        assert_eq!(values[2], Value::Bool(false));
    }

    #[test]
    fn insert_multiple_pages() {
        // Small page size forces page splits
        let mut bpm = make_bpm(64);
        let schema = Schema::new(vec![
            Column { name: "id".into(), col_type: ColumnType::Int32, nullable: false },
        ]);
        let mut table = TableHeap::create("nums".into(), schema, 32, &mut bpm).unwrap();

        // Each tuple: 1 byte null bitmap + 4 bytes int = 5 bytes
        // Page: 64 - 16 header = 48 usable. Each insert: 5 bytes data + 4 bytes slot = 9.
        // First page fits ~5 tuples. Insert 20 to force multiple pages.
        let mut row_ids = Vec::new();
        for i in 0..20 {
            let rid = table.insert(&mut bpm, &[Value::Int32(i)]).unwrap();
            row_ids.push(rid);
        }
        assert_eq!(table.row_count, 20);

        // Verify we used multiple pages
        let pages = table.page_ids(&mut bpm);
        assert!(pages.len() > 1, "Expected multiple pages, got {}", pages.len());
    }

    #[test]
    fn scan_returns_all_rows() {
        let mut bpm = make_bpm(128);
        let mut table = TableHeap::create(
            "users".into(), test_schema(), 64, &mut bpm
        ).unwrap();

        for i in 0..5 {
            table.insert(&mut bpm, &[
                Value::Int32(i),
                Value::VarChar(format!("user_{}", i)),
                Value::Bool(i % 2 == 0),
            ]).unwrap();
        }

        let rows = table.scan(&mut bpm);
        assert_eq!(rows.len(), 5);
        // Check first and last
        assert_eq!(rows[0].1[0], Value::Int32(0));
        assert_eq!(rows[4].1[0], Value::Int32(4));
    }

    #[test]
    fn delete_row() {
        let mut bpm = make_bpm(128);
        let mut table = TableHeap::create(
            "users".into(), test_schema(), 64, &mut bpm
        ).unwrap();

        let r0 = table.insert(&mut bpm, &[
            Value::Int32(1), Value::VarChar("A".into()), Value::Bool(true),
        ]).unwrap();
        let r1 = table.insert(&mut bpm, &[
            Value::Int32(2), Value::VarChar("B".into()), Value::Bool(false),
        ]).unwrap();

        assert!(table.delete(&mut bpm, r0));
        assert_eq!(table.row_count, 1);
        assert!(table.get(&mut bpm, r0).is_none());
        assert!(table.get(&mut bpm, r1).is_some());
    }
}
