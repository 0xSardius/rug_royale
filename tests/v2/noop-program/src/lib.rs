//! A program that succeeds on every instruction (test-only Magic program stand-in).
#![no_std]

/// # Safety
/// Called by the SBF loader with a pointer to the serialized input; never dereferenced.
#[no_mangle]
pub unsafe extern "C" fn entrypoint(_input: *mut u8) -> u64 {
    0
}

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    loop {}
}
