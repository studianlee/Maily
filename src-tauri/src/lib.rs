use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::io::{Read, Write};
use std::net::{TcpListener, SocketAddr};
use std::time::Duration;
use std::fs;
use socket2::{Socket, Domain, Type};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent, State, Emitter,
};
use serde::{Deserialize, Serialize};

// Google OAuth 설정
const GOOGLE_CLIENT_ID: &str = "79670033194-hi21nfsubttv5nfbmjtmh7ovusq4eltk.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET: &str = "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";
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_REDIRECT_URI: &str = "http://localhost:8585/callback";
const GMAIL_SCOPES: &str = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify";

// 토큰 저장용 상태
pub struct GoogleAuthState {
    pub access_token: Mutex<Option<String>>,
    pub refresh_token: Mutex<Option<String>>,
}

impl Default for GoogleAuthState {
    fn default() -> Self {
        Self {
            access_token: Mutex::new(None),
            refresh_token: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub token_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailMessage {
    pub id: String,
    pub thread_id: String,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub snippet: String,
    pub body: Option<String>,
    pub is_unread: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailListResponse {
    messages: Option<Vec<GmailMessageRef>>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GmailMessagesResult {
    pub messages: Vec<GmailMessage>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailMessageRef {
    id: String,
    #[serde(rename = "threadId")]
    thread_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailMessageDetail {
    id: String,
    #[serde(rename = "threadId")]
    thread_id: String,
    snippet: String,
    payload: GmailPayload,
    #[serde(rename = "internalDate")]
    internal_date: String,
    #[serde(rename = "labelIds", default)]
    label_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailPayload {
    headers: Vec<GmailHeader>,
    body: Option<GmailBody>,
    parts: Option<Vec<GmailPart>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailHeader {
    name: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailBody {
    data: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailPart {
    #[serde(rename = "mimeType")]
    mime_type: String,
    body: GmailBody,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaOptions {
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: i32,
    pub repeat_penalty: f32,
    pub num_ctx: i32,
    pub num_predict: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<OllamaOptions>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaResponse {
    pub response: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStreamChunk {
    pub response: String,
    pub done: bool,
}

#[tauri::command]
async fn generate_ai_response(
    prompt: String,
    model: Option<String>,
    system_prompt: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let model_name = model.unwrap_or_else(|| "exaone3.5:2.4b".to_string());

    let options = OllamaOptions {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
        num_ctx: 4096,
        num_predict: 1024,
    };

    let request = OllamaRequest {
        model: model_name,
        prompt,
        stream: false,
        system: system_prompt,
        options: Some(options),
    };

    let response = client
        .post("http://localhost:11434/api/generate")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    let ollama_response: OllamaResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    Ok(ollama_response.response)
}

#[tauri::command]
async fn generate_ai_response_stream(
    app: tauri::AppHandle,
    prompt: String,
    model: Option<String>,
    system_prompt: Option<String>,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let model_name = model.unwrap_or_else(|| "exaone3.5:2.4b".to_string());

    let options = OllamaOptions {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
        num_ctx: 4096,
        num_predict: 1024,
    };

    let request = OllamaRequest {
        model: model_name,
        prompt,
        stream: true,
        system: system_prompt,
        options: Some(options),
    };

    let response = client
        .post("http://localhost:11434/api/generate")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                // 여러 JSON 라인이 있을 수 있으므로 각 라인 처리
                for line in text.lines() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    if let Ok(chunk) = serde_json::from_str::<OllamaStreamChunk>(line) {
                        let _ = app.emit("ai-stream-chunk", &chunk.response);
                        if chunk.done {
                            let _ = app.emit("ai-stream-done", ());
                        }
                    }
                }
            }
            Err(e) => {
                let _ = app.emit("ai-stream-error", e.to_string());
                break;
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn check_ollama_status() -> Result<bool, String> {
    let client = reqwest::Client::new();
    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn show_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// === Gmail 관련 함수 ===

#[tauri::command]
fn get_google_auth_url() -> String {
    format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        GOOGLE_AUTH_URL,
        GOOGLE_CLIENT_ID,
        urlencoding::encode(GOOGLE_REDIRECT_URI),
        urlencoding::encode(GMAIL_SCOPES)
    )
}

#[tauri::command]
async fn start_google_auth(
    state: State<'_, GoogleAuthState>,
) -> Result<String, String> {
    // 인증 URL 생성
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        GOOGLE_AUTH_URL,
        GOOGLE_CLIENT_ID,
        urlencoding::encode(GOOGLE_REDIRECT_URI),
        urlencoding::encode(GMAIL_SCOPES)
    );

    // 로컬 서버 시작 (콜백 수신용) - SO_REUSEADDR 옵션으로 포트 재사용 허용
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)
        .map_err(|e| format!("소켓 생성 실패: {}", e))?;
    socket.set_reuse_address(true)
        .map_err(|e| format!("SO_REUSEADDR 설정 실패: {}", e))?;
    // 2분 타임아웃 설정
    socket.set_read_timeout(Some(Duration::from_secs(120)))
        .map_err(|e| format!("타임아웃 설정 실패: {}", e))?;
    let addr: SocketAddr = "127.0.0.1:8585".parse().unwrap();
    socket.bind(&addr.into())
        .map_err(|e| format!("포트 바인딩 실패 (8585 포트가 사용 중일 수 있습니다): {}", e))?;
    socket.listen(1)
        .map_err(|e| format!("리슨 실패: {}", e))?;
    let listener: TcpListener = socket.into();
    // accept에도 타임아웃 적용
    listener.set_nonblocking(false).ok();
    let std_listener = listener;

    // 브라우저에서 인증 URL 열기
    webbrowser::open(&auth_url)
        .map_err(|e| format!("브라우저 열기 실패: {}", e))?;

    // 콜백 대기 (타임아웃 적용)
    std_listener.set_nonblocking(false).ok();
    let (mut stream, _) = std_listener.accept()
        .map_err(|e| format!("인증 대기 시간 초과 또는 연결 실패: {}", e))?;

    // 스트림에도 타임아웃 설정
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();

    let mut buffer = [0; 2048];
    stream.read(&mut buffer)
        .map_err(|e| format!("요청 읽기 실패: {}", e))?;

    let request = String::from_utf8_lossy(&buffer);

    // 코드 추출
    let code = request
        .lines()
        .next()
        .and_then(|line| {
            line.split_whitespace()
                .nth(1)
                .and_then(|path| {
                    path.split("code=")
                        .nth(1)
                        .map(|c| c.split('&').next().unwrap_or(c).to_string())
                })
        })
        .ok_or("인증 코드를 찾을 수 없습니다")?;

    // 성공 응답 보내기
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><h1>인증 완료!</h1><p>이 창을 닫고 앱으로 돌아가세요.</p><script>window.close();</script></body></html>";
    let _ = stream.write_all(response.as_bytes());

    // 토큰 교환
    let client = reqwest::Client::new();
    let params = [
        ("client_id", GOOGLE_CLIENT_ID),
        ("client_secret", GOOGLE_CLIENT_SECRET),
        ("code", code.as_str()),
        ("redirect_uri", GOOGLE_REDIRECT_URI),
        ("grant_type", "authorization_code"),
    ];

    let token_response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("토큰 교환 실패: {}", e))?;

    let token_data: GoogleTokenResponse = token_response
        .json()
        .await
        .map_err(|e| format!("토큰 파싱 실패: {}", e))?;

    // 상태에 토큰 저장
    *state.access_token.lock().unwrap() = Some(token_data.access_token.clone());
    if let Some(ref refresh) = token_data.refresh_token {
        *state.refresh_token.lock().unwrap() = Some(refresh.clone());
    }

    Ok(token_data.access_token)
}

#[tauri::command]
async fn exchange_google_code(
    code: String,
    state: State<'_, GoogleAuthState>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let params = [
        ("client_id", GOOGLE_CLIENT_ID),
        ("client_secret", GOOGLE_CLIENT_SECRET),
        ("code", &code),
        ("redirect_uri", GOOGLE_REDIRECT_URI),
        ("grant_type", "authorization_code"),
    ];

    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("토큰 교환 실패: {}", e))?;

    let token_response: GoogleTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("토큰 파싱 실패: {}", e))?;

    // 상태에 토큰 저장
    *state.access_token.lock().unwrap() = Some(token_response.access_token.clone());
    if let Some(ref refresh) = token_response.refresh_token {
        *state.refresh_token.lock().unwrap() = Some(refresh.clone());
    }

    Ok(token_response.access_token)
}

#[tauri::command]
async fn get_gmail_messages(
    state: State<'_, GoogleAuthState>,
    max_results: Option<u32>,
    search_query: Option<String>,
    page_token: Option<String>,
) -> Result<GmailMessagesResult, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let max = max_results.unwrap_or(20);

    // 기본 URL 구성
    let mut list_url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults={}",
        max
    );

    // 검색 쿼리 추가
    if let Some(query) = &search_query {
        if !query.trim().is_empty() {
            list_url.push_str(&format!("&q={}", urlencoding::encode(query.trim())));
        }
    }

    // 페이지 토큰 추가
    if let Some(token) = &page_token {
        list_url.push_str(&format!("&pageToken={}", token));
    }

    let list_response: GmailListResponse = client
        .get(&list_url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("메일 목록 조회 실패: {}", e))?
        .json()
        .await
        .map_err(|e| format!("메일 목록 파싱 실패: {}", e))?;

    let message_refs = list_response.messages.unwrap_or_default();
    let mut messages = Vec::new();

    // 각 메일의 상세 정보 가져오기
    for msg_ref in message_refs.iter().take(max as usize) {
        let detail_url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
            msg_ref.id
        );

        if let Ok(response) = client
            .get(&detail_url)
            .bearer_auth(&access_token)
            .send()
            .await
        {
            if let Ok(detail) = response.json::<GmailMessageDetail>().await {
                let subject = detail.payload.headers.iter()
                    .find(|h| h.name.eq_ignore_ascii_case("Subject"))
                    .map(|h| h.value.clone())
                    .unwrap_or_default();

                let from = detail.payload.headers.iter()
                    .find(|h| h.name.eq_ignore_ascii_case("From"))
                    .map(|h| h.value.clone())
                    .unwrap_or_default();

                let date = detail.payload.headers.iter()
                    .find(|h| h.name.eq_ignore_ascii_case("Date"))
                    .map(|h| h.value.clone())
                    .unwrap_or_default();

                let is_unread = detail.label_ids.iter().any(|l| l == "UNREAD");

                messages.push(GmailMessage {
                    id: detail.id,
                    thread_id: detail.thread_id,
                    subject,
                    from,
                    date,
                    snippet: detail.snippet,
                    body: None,
                    is_unread,
                });
            }
        }
    }

    Ok(GmailMessagesResult {
        messages,
        next_page_token: list_response.next_page_token,
    })
}

#[tauri::command]
async fn get_gmail_message_detail(
    state: State<'_, GoogleAuthState>,
    message_id: String,
) -> Result<GmailMessage, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}?format=full",
        message_id
    );

    let detail: GmailMessageDetail = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("메일 조회 실패: {}", e))?
        .json()
        .await
        .map_err(|e| format!("메일 파싱 실패: {}", e))?;

    let subject = detail.payload.headers.iter()
        .find(|h| h.name.eq_ignore_ascii_case("Subject"))
        .map(|h| h.value.clone())
        .unwrap_or_default();

    let from = detail.payload.headers.iter()
        .find(|h| h.name.eq_ignore_ascii_case("From"))
        .map(|h| h.value.clone())
        .unwrap_or_default();

    let date = detail.payload.headers.iter()
        .find(|h| h.name.eq_ignore_ascii_case("Date"))
        .map(|h| h.value.clone())
        .unwrap_or_default();

    // 본문 추출
    let body = extract_body(&detail.payload);
    let is_unread = detail.label_ids.iter().any(|l| l == "UNREAD");

    Ok(GmailMessage {
        id: detail.id,
        thread_id: detail.thread_id,
        subject,
        from,
        date,
        snippet: detail.snippet,
        body: Some(body),
        is_unread,
    })
}

fn extract_body(payload: &GmailPayload) -> String {
    // parts가 있으면 text/plain 찾기
    if let Some(parts) = &payload.parts {
        for part in parts {
            if part.mime_type == "text/plain" {
                if let Some(data) = &part.body.data {
                    return decode_base64(data);
                }
            }
        }
    }

    // 단일 body인 경우
    if let Some(body) = &payload.body {
        if let Some(data) = &body.data {
            return decode_base64(data);
        }
    }

    String::new()
}

fn decode_base64(data: &str) -> String {
    use base64::{Engine as _, engine::general_purpose};
    let decoded = data.replace('-', "+").replace('_', "/");
    general_purpose::STANDARD
        .decode(&decoded)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_default()
}

#[tauri::command]
async fn send_gmail(
    state: State<'_, GoogleAuthState>,
    to: String,
    subject: String,
    body: String,
) -> Result<String, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();

    // RFC 2822 형식의 이메일 생성
    let email = format!(
        "To: {}\r\nSubject: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}",
        to, subject, body
    );

    // Base64 URL-safe 인코딩
    use base64::{Engine as _, engine::general_purpose};
    let encoded = general_purpose::URL_SAFE_NO_PAD.encode(email.as_bytes());

    let send_body = serde_json::json!({
        "raw": encoded
    });

    let response = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(&access_token)
        .json(&send_body)
        .send()
        .await
        .map_err(|e| format!("메일 전송 실패: {}", e))?;

    if response.status().is_success() {
        Ok("메일이 전송되었습니다".to_string())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("메일 전송 실패: {}", error_text))
    }
}

#[tauri::command]
async fn mark_as_read(
    state: State<'_, GoogleAuthState>,
    message_id: String,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/modify",
        message_id
    );

    let body = serde_json::json!({
        "removeLabelIds": ["UNREAD"]
    });

    let response = client
        .post(&url)
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("읽음 처리 실패: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("읽음 처리 실패: {}", error_text))
    }
}

#[tauri::command]
fn is_gmail_authenticated(state: State<'_, GoogleAuthState>) -> bool {
    state.access_token.lock().unwrap().is_some()
}

#[tauri::command]
fn set_gmail_tokens(
    state: State<'_, GoogleAuthState>,
    access_token: String,
    refresh_token: Option<String>,
) {
    *state.access_token.lock().unwrap() = Some(access_token);
    if let Some(refresh) = refresh_token {
        *state.refresh_token.lock().unwrap() = Some(refresh);
    }
}

#[tauri::command]
fn logout_gmail(state: State<'_, GoogleAuthState>, app: tauri::AppHandle) {
    *state.access_token.lock().unwrap() = None;
    *state.refresh_token.lock().unwrap() = None;
    // 저장된 토큰 파일 삭제
    if let Ok(data_dir) = app.path().app_data_dir() {
        let token_path = data_dir.join("gmail_tokens.json");
        let _ = fs::remove_file(token_path);
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct SavedTokens {
    access_token: String,
    refresh_token: Option<String>,
}

fn get_token_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("gmail_tokens.json"))
}

#[tauri::command]
fn save_gmail_tokens(
    state: State<'_, GoogleAuthState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone();
    let refresh_token = state.refresh_token.lock().unwrap().clone();

    if let Some(access) = access_token {
        let tokens = SavedTokens {
            access_token: access,
            refresh_token,
        };

        if let Some(token_path) = get_token_path(&app) {
            // 디렉토리 생성
            if let Some(parent) = token_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let json = serde_json::to_string(&tokens).map_err(|e| e.to_string())?;
            fs::write(&token_path, json).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn load_gmail_tokens(
    state: State<'_, GoogleAuthState>,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    if let Some(token_path) = get_token_path(&app) {
        if token_path.exists() {
            let json = fs::read_to_string(&token_path).map_err(|e| e.to_string())?;
            let tokens: SavedTokens = serde_json::from_str(&json).map_err(|e| e.to_string())?;

            *state.access_token.lock().unwrap() = Some(tokens.access_token);
            *state.refresh_token.lock().unwrap() = tokens.refresh_token;

            return Ok(true);
        }
    }
    Ok(false)
}

// 이메일 캐시 관련 함수
fn get_email_cache_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("gmail_cache.json"))
}

#[derive(Debug, Serialize, Deserialize)]
struct EmailCache {
    messages: Vec<GmailMessage>,
    cached_at: i64,
}

#[tauri::command]
fn save_email_cache(
    emails: Vec<GmailMessage>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if let Some(cache_path) = get_email_cache_path(&app) {
        if let Some(parent) = cache_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let cache = EmailCache {
            messages: emails,
            cached_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0),
        };

        let json = serde_json::to_string(&cache).map_err(|e| e.to_string())?;
        fs::write(&cache_path, json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn load_email_cache(
    app: tauri::AppHandle,
) -> Result<Option<Vec<GmailMessage>>, String> {
    if let Some(cache_path) = get_email_cache_path(&app) {
        if cache_path.exists() {
            let json = fs::read_to_string(&cache_path).map_err(|e| e.to_string())?;
            let cache: EmailCache = serde_json::from_str(&json).map_err(|e| e.to_string())?;

            // 24시간 이내의 캐시만 사용
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            if now - cache.cached_at < 86400 {
                return Ok(Some(cache.messages));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn clear_email_cache(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(cache_path) = get_email_cache_path(&app) {
        if cache_path.exists() {
            let _ = fs::remove_file(cache_path);
        }
    }
    Ok(())
}

// 토큰 갱신 함수
#[tauri::command]
async fn refresh_gmail_token(
    state: State<'_, GoogleAuthState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let refresh_token = state.refresh_token.lock().unwrap().clone()
        .ok_or("리프레시 토큰이 없습니다. 다시 로그인해주세요.")?;

    let client = reqwest::Client::new();
    let params = [
        ("client_id", GOOGLE_CLIENT_ID),
        ("client_secret", GOOGLE_CLIENT_SECRET),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("토큰 갱신 요청 실패: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("토큰 갱신 실패: {}. 다시 로그인해주세요.", error_text));
    }

    let token_data: GoogleTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("토큰 파싱 실패: {}", e))?;

    // 새 access_token 저장
    *state.access_token.lock().unwrap() = Some(token_data.access_token.clone());
    // refresh_token이 새로 온 경우 업데이트
    if let Some(ref new_refresh) = token_data.refresh_token {
        *state.refresh_token.lock().unwrap() = Some(new_refresh.clone());
    }

    // 파일에도 저장
    let access = token_data.access_token.clone();
    let refresh = state.refresh_token.lock().unwrap().clone();
    let tokens = SavedTokens {
        access_token: access.clone(),
        refresh_token: refresh,
    };
    if let Some(token_path) = get_token_path(&app) {
        if let Some(parent) = token_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(&tokens) {
            let _ = fs::write(&token_path, json);
        }
    }

    Ok(token_data.access_token)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub size: String,
    pub modified: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaModel {
    name: String,
    size: u64,
    modified_at: String,
}

fn get_ollama_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let resource_dir = app_handle.path().resource_dir().unwrap_or_default();
    if cfg!(target_os = "windows") {
        resource_dir.join("ollama").join("ollama.exe")
    } else {
        resource_dir.join("ollama").join("ollama")
    }
}

#[tauri::command]
async fn start_ollama(app_handle: tauri::AppHandle) -> Result<String, String> {
    let ollama_path = get_ollama_path(&app_handle);
    
    if !ollama_path.exists() {
        if let Ok(output) = Command::new("ollama").arg("--version").output() {
            if output.status.success() {
                let _ = Command::new("ollama").arg("serve").spawn();
                return Ok("Started system Ollama".to_string());
            }
        }
        return Err("Ollama not found".to_string());
    }
    
    let _ = Command::new(&ollama_path).arg("serve").spawn();
    Ok("Started bundled Ollama".to_string())
}

#[tauri::command]
async fn list_models() -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let tags: OllamaTagsResponse = response.json().await.map_err(|e| e.to_string())?;
    
    let models = tags.models.unwrap_or_default().iter().map(|m| {
        ModelInfo {
            name: m.name.clone(),
            size: format!("{:.1} GB", m.size as f64 / 1_000_000_000.0),
            modified: m.modified_at.clone(),
        }
    }).collect();
    
    Ok(models)
}

#[tauri::command]
async fn pull_model(model_name: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "name": model_name });
    
    client
        .post("http://localhost:11434/api/pull")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(format!("Started pulling {}", model_name))
}

#[tauri::command]
fn get_app_info(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let ollama_path = get_ollama_path(&app_handle);
    let data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "ollama_bundled": ollama_path.exists(),
        "ollama_path": ollama_path.to_string_lossy(),
        "data_dir": data_dir.to_string_lossy(),
    }))
}
pub fn run() {
    tauri::Builder::default()
        .manage(GoogleAuthState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Create tray menu
            let quit_item = MenuItem::with_id(app, "quit", "Quit Maily", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Show window on startup and remove border
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_shadow(false);
                let _ = window.show();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of close
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            generate_ai_response, generate_ai_response_stream,
            start_ollama, list_models, pull_model, get_app_info,
            check_ollama_status,
            show_window,
            hide_window,
            exit_app,
            // Gmail 관련
            get_google_auth_url,
            start_google_auth,
            exchange_google_code,
            get_gmail_messages,
            get_gmail_message_detail,
            send_gmail,
            mark_as_read,
            is_gmail_authenticated,
            set_gmail_tokens,
            logout_gmail,
            save_gmail_tokens,
            load_gmail_tokens,
            refresh_gmail_token,
            // 이메일 캐시
            save_email_cache,
            load_email_cache,
            clear_email_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
