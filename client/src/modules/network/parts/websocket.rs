#[cfg(target_arch = "wasm32")]
use std::cell::RefCell;
#[cfg(target_arch = "wasm32")]
use std::collections::VecDeque;
#[cfg(target_arch = "wasm32")]
use std::rc::Rc;

use pong_shared::messages::ServerMessage;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::closure::Closure;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;
#[cfg(target_arch = "wasm32")]
use web_sys::{MessageEvent, WebSocket};

#[cfg(target_arch = "wasm32")]
pub struct WsClient {
    ws: WebSocket,
    inbox: Rc<RefCell<VecDeque<ServerMessage>>>,
    _on_message: Closure<dyn FnMut(MessageEvent)>,
    _on_close: Closure<dyn FnMut()>,
}

// SAFETY: WASM is single-threaded, so Rc<RefCell> is safe to use as Send/Sync
#[cfg(target_arch = "wasm32")]
unsafe impl Send for WsClient {}
#[cfg(target_arch = "wasm32")]
unsafe impl Sync for WsClient {}

#[cfg(target_arch = "wasm32")]
impl WsClient {
    pub fn connect(url: &str) -> Result<Self, String> {
        let ws = WebSocket::new(url).map_err(|e| format!("{e:?}"))?;

        let inbox: Rc<RefCell<VecDeque<ServerMessage>>> =
            Rc::new(RefCell::new(VecDeque::new()));

        let inbox_clone = inbox.clone();
        let on_message = Closure::wrap(Box::new(move |event: MessageEvent| {
            if let Some(text) = event.data().as_string() {
                match serde_json::from_str::<ServerMessage>(&text) {
                    Ok(msg) => {
                        inbox_clone.borrow_mut().push_back(msg);
                    }
                    Err(e) => {
                        web_sys::console::warn_1(
                            &format!("WS deserialize error: {e} | raw: {text}").into(),
                        );
                    }
                }
            }
        }) as Box<dyn FnMut(MessageEvent)>);

        ws.set_onmessage(Some(on_message.as_ref().unchecked_ref()));

        let on_close = Closure::wrap(Box::new(move || {
            web_sys::console::log_1(&"WebSocket closed".into());
        }) as Box<dyn FnMut()>);

        ws.set_onclose(Some(on_close.as_ref().unchecked_ref()));

        Ok(Self {
            ws,
            inbox,
            _on_message: on_message,
            _on_close: on_close,
        })
    }

    pub fn send_text(&self, text: &str) {
        let _ = self.ws.send_with_str(text);
    }

    pub fn drain_inbox(&self) -> Vec<ServerMessage> {
        self.inbox.borrow_mut().drain(..).collect()
    }

    pub fn is_open(&self) -> bool {
        self.ws.ready_state() == WebSocket::OPEN
    }

    pub fn close(&self) {
        let _ = self.ws.close();
    }
}

#[cfg(target_arch = "wasm32")]
impl Drop for WsClient {
    fn drop(&mut self) {
        let _ = self.ws.close();
    }
}

// Stub for non-wasm targets (allows cargo check on host)
#[cfg(not(target_arch = "wasm32"))]
pub struct WsClient;

#[cfg(not(target_arch = "wasm32"))]
impl WsClient {
    pub fn connect(_url: &str) -> Result<Self, String> {
        Err("WebSocket only available on WASM".to_string())
    }
    pub fn send_text(&self, _text: &str) {}
    pub fn drain_inbox(&self) -> Vec<ServerMessage> { vec![] }
    pub fn is_open(&self) -> bool { false }
    pub fn close(&self) {}
}
