use crate::storage::types::PAGE_HEADER_SIZE;

/// Engine configuration — set once at initialization.
#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// Size of each page in bytes (64..=8192, multiple of 8).
    pub page_size: u32,
    /// Number of frames in the buffer pool (4..=32).
    pub pool_size: u32,
    /// Maximum number of pages on "disk" (16..=256, >= pool_size).
    pub disk_capacity: u32,
    /// Values larger than this spill to overflow pages.
    pub overflow_threshold: u32,
}

impl EngineConfig {
    pub fn default_config() -> Self {
        Self {
            page_size: 128,
            pool_size: 8,
            disk_capacity: 64,
            overflow_threshold: 64,
        }
    }

    /// Validate and clamp fields to legal ranges. Returns an error string on
    /// truly invalid input, otherwise silently clamps.
    pub fn validate(&mut self) -> Result<(), String> {
        // Page size: 64..=8192, multiple of 8
        if self.page_size < 64 {
            self.page_size = 64;
        }
        if self.page_size > 8192 {
            self.page_size = 8192;
        }
        // Round up to multiple of 8
        self.page_size = (self.page_size + 7) & !7;

        // Pool size: 4..=32
        self.pool_size = self.pool_size.clamp(4, 32);

        // Disk capacity: 16..=256, must be >= pool_size
        self.disk_capacity = self.disk_capacity.clamp(16, 256);
        if self.disk_capacity < self.pool_size {
            self.disk_capacity = self.pool_size;
        }

        // Overflow threshold: 32..=(page_size - header - one slot)
        let max_overflow = self.page_size as u32 - PAGE_HEADER_SIZE as u32 - 4 /*slot*/;
        if self.overflow_threshold < 32 {
            self.overflow_threshold = 32;
        }
        if self.overflow_threshold > max_overflow {
            self.overflow_threshold = max_overflow;
        }

        Ok(())
    }

    /// Usable data space inside a page (total - header).
    pub fn page_data_capacity(&self) -> usize {
        self.page_size as usize - PAGE_HEADER_SIZE
    }
}
