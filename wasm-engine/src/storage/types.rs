/// Page identifier — index into the disk's page array.
pub type PageId = u32;

/// Frame identifier — index into the buffer pool's frame array.
pub type FrameId = u32;

/// Slot identifier — index into a page's slot array.
pub type SlotId = u16;

/// A globally unique tuple address: (page, slot).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RowId {
    pub page_id: PageId,
    pub slot_id: SlotId,
}

/// Sentinel value meaning "no page" / "no frame" / "no next".
pub const INVALID_PAGE: PageId = u32::MAX;

// ── Page layout constants ──────────────────────────────────────────

/// Page header is 16 bytes:
///   [0..4]   page_id   : u32
///   [4]      page_type  : u8   (0=Data, 1=Overflow, 2=Free)
///   [5..7]   slot_count : u16
///   [7..9]   free_start : u16  (byte offset: end of slot array)
///   [9..11]  free_end   : u16  (byte offset: start of tuple data from bottom)
///   [11..15] next_page  : u32
///   [15]     _reserved  : u8
pub const PAGE_HEADER_SIZE: usize = 16;

/// Each slot is 4 bytes:
///   [0..2] offset : u16  (byte offset of tuple within page)
///   [2..4] length : u16  (0 = deleted tombstone)
pub const SLOT_SIZE: usize = 4;

/// Page type discriminants.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PageType {
    Data = 0,
    Overflow = 1,
    Free = 2,
}

impl PageType {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => PageType::Data,
            1 => PageType::Overflow,
            2 => PageType::Free,
            _ => PageType::Free,
        }
    }
}
