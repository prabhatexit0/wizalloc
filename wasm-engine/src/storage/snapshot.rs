//! Binary snapshot encoding for shipping state to the frontend.
//!
//! All multi-byte values are little-endian.

use crate::storage::types::*;
use crate::storage::page;
use crate::storage::buffer_pool::BufferPoolManager;
use crate::storage::schema::Schema;

// ── Helpers ────────────────────────────────────────────────────────

fn push_u8(buf: &mut Vec<u8>, v: u8) { buf.push(v); }
fn push_u16(buf: &mut Vec<u8>, v: u16) { buf.extend_from_slice(&v.to_le_bytes()); }
fn push_u32(buf: &mut Vec<u8>, v: u32) { buf.extend_from_slice(&v.to_le_bytes()); }
fn push_u64(buf: &mut Vec<u8>, v: u64) { buf.extend_from_slice(&v.to_le_bytes()); }
fn push_f64(buf: &mut Vec<u8>, v: f64) { buf.extend_from_slice(&v.to_le_bytes()); }

// ── Buffer Pool Snapshot ───────────────────────────────────────────

/// Encode the full buffer pool state for visualization.
///
/// Format:
/// ```text
/// pool_size    : u32
/// page_size    : u32
/// num_frames : frame_count entries, each:
///     page_id    : u32  (INVALID_PAGE if empty)
///     pin_count  : u32
///     is_dirty   : u8
///     is_occupied: u8
/// page_table_len : u32
///   (page_id: u32, frame_id: u32) × page_table_len
/// lru_order_len : u32
///   frame_id: u32 × lru_order_len
/// hit_count    : u64
/// miss_count   : u64
/// disk_read_count  : u64
/// disk_write_count : u64
/// disk_num_allocated : u32
/// disk_max_pages     : u32
/// disk_base_ptr      : u32
/// ```
pub fn snapshot_buffer_pool(bpm: &BufferPoolManager) -> Vec<u8> {
    let mut buf = Vec::with_capacity(512);

    push_u32(&mut buf, bpm.pool_size() as u32);
    push_u32(&mut buf, bpm.page_size());

    // Frames
    for frame in &bpm.frames {
        push_u32(&mut buf, frame.page_id.unwrap_or(INVALID_PAGE));
        push_u32(&mut buf, frame.pin_count);
        push_u8(&mut buf, frame.is_dirty as u8);
        push_u8(&mut buf, frame.page_id.is_some() as u8);
    }

    // Page table
    let pt = bpm.page_table();
    push_u32(&mut buf, pt.len() as u32);
    for (&page_id, &frame_id) in pt {
        push_u32(&mut buf, page_id);
        push_u32(&mut buf, frame_id);
    }

    // LRU order
    let lru = bpm.replacer().lru_order();
    push_u32(&mut buf, lru.len() as u32);
    for &fid in lru {
        push_u32(&mut buf, fid);
    }

    // Stats
    push_u64(&mut buf, bpm.hit_count);
    push_u64(&mut buf, bpm.miss_count);
    push_u64(&mut buf, bpm.disk.read_count);
    push_u64(&mut buf, bpm.disk.write_count);
    push_u32(&mut buf, bpm.disk.num_allocated());
    push_u32(&mut buf, bpm.disk.max_pages());
    push_u32(&mut buf, bpm.disk.storage_base_ptr() as u32);

    buf
}

// ── Disk Snapshot ──────────────────────────────────────────────────

/// Encode the disk overview for visualization.
///
/// Format:
/// ```text
/// max_pages      : u32
/// page_size      : u32
/// num_allocated  : u32
/// disk_base_ptr  : u32
/// for each page 0..max_pages:
///     is_allocated : u8
///     page_type    : u8   (only meaningful if allocated; read from disk bytes)
/// ```
pub fn snapshot_disk(bpm: &BufferPoolManager) -> Vec<u8> {
    let max = bpm.disk.max_pages();
    let mut buf = Vec::with_capacity(16 + max as usize * 2);

    push_u32(&mut buf, max);
    push_u32(&mut buf, bpm.page_size());
    push_u32(&mut buf, bpm.disk.num_allocated());
    push_u32(&mut buf, bpm.disk.storage_base_ptr() as u32);

    let bitmap = bpm.disk.allocation_bitmap();
    for i in 0..max as usize {
        push_u8(&mut buf, bitmap[i] as u8);
        if bitmap[i] {
            // Read page_type from the raw disk bytes
            let page_data = bpm.disk.page_data(i as PageId);
            push_u8(&mut buf, page_data[4]); // page_type byte at offset 4
        } else {
            push_u8(&mut buf, PageType::Free as u8);
        }
    }

    buf
}

// ── Page Detail Snapshot ───────────────────────────────────────────

/// Encode a detailed view of a single page (for the page inspector).
///
/// Format:
/// ```text
/// page_size      : u32
/// page_id        : u32
/// page_type      : u8
/// slot_count     : u16
/// free_start     : u16
/// free_end       : u16
/// next_page_id   : u32
/// free_space     : u16
/// num_slots      : u16
/// for each slot:
///     offset     : u16
///     length     : u16
/// raw_bytes      : [u8; page_size]   (the entire page)
/// ```
pub fn snapshot_page(bpm: &mut BufferPoolManager, page_id: PageId) -> Option<Vec<u8>> {
    let frame_id = bpm.fetch_page(page_id)?;
    let data = &bpm.frames[frame_id as usize].data;
    let ps = bpm.page_size();

    let mut buf = Vec::with_capacity(ps as usize + 64);

    push_u32(&mut buf, ps);
    push_u32(&mut buf, page::page_id(data));
    push_u8(&mut buf, data[4]); // page_type
    let sc = page::slot_count(data);
    push_u16(&mut buf, sc);
    push_u16(&mut buf, page::free_start(data));
    push_u16(&mut buf, page::free_end(data));
    push_u32(&mut buf, page::next_page(data));
    push_u16(&mut buf, page::free_space(data) as u16);

    // Slots
    push_u16(&mut buf, sc);
    for i in 0..sc {
        let (off, len) = page::read_slot(data, i);
        push_u16(&mut buf, off);
        push_u16(&mut buf, len);
    }

    // Raw bytes
    buf.extend_from_slice(data);

    bpm.unpin_page(page_id, false);
    Some(buf)
}

// ── Table Snapshot ─────────────────────────────────────────────────

/// Encode table metadata for visualization.
///
/// Format:
/// ```text
/// name_len       : u16
/// name           : UTF-8 bytes
/// row_count      : u32
/// first_page_id  : u32
/// num_columns    : u16
/// for each column:
///     name_len   : u16
///     name       : UTF-8 bytes
///     type_tag   : u8
///     nullable   : u8
///     max_len    : u16  (for VarChar/Blob, 0 otherwise)
/// page_count     : u32
/// page_ids       : u32 × page_count
/// ```
pub fn snapshot_table(
    name: &str,
    schema: &Schema,
    first_page_id: PageId,
    row_count: u32,
    page_ids: &[PageId],
) -> Vec<u8> {
    let mut buf = Vec::with_capacity(256);

    // Name
    let name_bytes = name.as_bytes();
    push_u16(&mut buf, name_bytes.len() as u16);
    buf.extend_from_slice(name_bytes);

    push_u32(&mut buf, row_count);
    push_u32(&mut buf, first_page_id);

    // Columns
    push_u16(&mut buf, schema.columns.len() as u16);
    for col in &schema.columns {
        let col_name = col.name.as_bytes();
        push_u16(&mut buf, col_name.len() as u16);
        buf.extend_from_slice(col_name);
        push_u8(&mut buf, col.col_type.type_tag());
        push_u8(&mut buf, col.nullable as u8);
        let max_len = match &col.col_type {
            crate::storage::schema::ColumnType::VarChar(n) => *n,
            crate::storage::schema::ColumnType::Blob(n) => *n,
            _ => 0,
        };
        push_u16(&mut buf, max_len);
    }

    // Pages
    push_u32(&mut buf, page_ids.len() as u32);
    for &pid in page_ids {
        push_u32(&mut buf, pid);
    }

    buf
}
