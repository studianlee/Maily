use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::io::{Read, Write};
use std::net::{TcpListener, SocketAddr};
use std::time::Duration;
use std::fs;
use socket2::{Socket, Domain, Type};
use rusqlite::{Connection, params};
use chrono::Utc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent, State, Emitter, AppHandle,
};
use serde::{Deserialize, Serialize};

// Google OAuth 설정 (환경변수에서 로드)
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_REDIRECT_URI: &str = "http://localhost:8585/callback";
const GMAIL_SCOPES: &str = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify";

// Microsoft OAuth 설정 (환경변수에서 로드)
const MS_AUTH_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_REDIRECT_URI: &str = "http://localhost:8586/callback";
const MS_SCOPES: &str = "openid profile email offline_access Mail.Read Mail.Send Mail.ReadWrite";

// 환경변수에서 OAuth 자격증명 로드
fn get_google_client_id() -> String {
    std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default()
}

fn get_google_client_secret() -> String {
    std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default()
}

fn get_ms_client_id() -> String {
    std::env::var("MS_CLIENT_ID").unwrap_or_default()
}

fn get_ms_client_secret() -> String {
    std::env::var("MS_CLIENT_SECRET").unwrap_or_default()
}

// 토큰 저장용 상태 - Google
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

// 토큰 저장용 상태 - Microsoft
pub struct MicrosoftAuthState {
    pub access_token: Mutex<Option<String>>,
    pub refresh_token: Mutex<Option<String>>,
}

impl Default for MicrosoftAuthState {
    fn default() -> Self {
        Self {
            access_token: Mutex::new(None),
            refresh_token: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MicrosoftTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub token_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub token_type: String,
}

// 첨부파일 정보
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
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
    pub labels: Vec<String>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
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
    #[serde(rename = "attachmentId")]
    attachment_id: Option<String>,
    size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailPart {
    #[serde(rename = "mimeType")]
    mime_type: String,
    filename: Option<String>,
    body: GmailBody,
    parts: Option<Vec<GmailPart>>,
}

// Outlook 메시지 타입
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookMessage {
    pub id: String,
    #[serde(rename = "conversationId")]
    pub conversation_id: Option<String>,
    pub subject: Option<String>,
    pub from: Option<OutlookEmailAddress>,
    #[serde(rename = "receivedDateTime")]
    pub received_date_time: Option<String>,
    #[serde(rename = "bodyPreview")]
    pub body_preview: Option<String>,
    pub body: Option<OutlookBody>,
    #[serde(rename = "isRead")]
    pub is_read: Option<bool>,
    #[serde(rename = "inferenceClassification")]
    pub inference_classification: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookEmailAddress {
    #[serde(rename = "emailAddress")]
    pub email_address: Option<OutlookEmail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookEmail {
    pub name: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookBody {
    #[serde(rename = "contentType")]
    pub content_type: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OutlookListResponse {
    value: Option<Vec<OutlookMessage>>,
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookMessagesResult {
    pub messages: Vec<OutlookMessageSimple>,
    pub next_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookMessageSimple {
    pub id: String,
    pub conversation_id: String,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub snippet: String,
    pub body: Option<String>,
    pub is_unread: bool,
    pub labels: Vec<String>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
}

// Outlook 첨부파일 API 응답
#[derive(Debug, Serialize, Deserialize)]
struct OutlookAttachment {
    id: String,
    name: String,
    #[serde(rename = "contentType")]
    content_type: String,
    size: u64,
    #[serde(rename = "contentBytes")]
    content_bytes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OutlookAttachmentsResponse {
    value: Option<Vec<OutlookAttachment>>,
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
        &get_google_client_id(),
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
        &get_google_client_id(),
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
    let google_client_id = get_google_client_id();
    let google_client_secret = get_google_client_secret();
    let params = [
        ("client_id", google_client_id.as_str()),
        ("client_secret", google_client_secret.as_str()),
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
    let google_client_id = get_google_client_id();
    let google_client_secret = get_google_client_secret();

    let params = [
        ("client_id", google_client_id.as_str()),
        ("client_secret", google_client_secret.as_str()),
        ("code", code.as_str()),
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
                    labels: detail.label_ids,
                    attachments: Vec::new(), // 목록에서는 첨부파일 정보 생략
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
    let attachments = extract_attachments(&detail.payload);

    Ok(GmailMessage {
        id: detail.id,
        thread_id: detail.thread_id,
        subject,
        from,
        date,
        snippet: detail.snippet,
        body: Some(body),
        is_unread,
        labels: detail.label_ids,
        attachments,
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

fn extract_attachments(payload: &GmailPayload) -> Vec<Attachment> {
    let mut attachments = Vec::new();

    fn collect_attachments(parts: &[GmailPart], attachments: &mut Vec<Attachment>) {
        for part in parts {
            // 첨부파일인 경우 (attachmentId가 있고 filename이 있는 경우)
            if let Some(attachment_id) = &part.body.attachment_id {
                if let Some(filename) = &part.filename {
                    if !filename.is_empty() {
                        attachments.push(Attachment {
                            id: attachment_id.clone(),
                            filename: filename.clone(),
                            mime_type: part.mime_type.clone(),
                            size: part.body.size.unwrap_or(0),
                        });
                    }
                }
            }
            // 중첩된 parts가 있으면 재귀적으로 탐색
            if let Some(nested_parts) = &part.parts {
                collect_attachments(nested_parts, attachments);
            }
        }
    }

    if let Some(parts) = &payload.parts {
        collect_attachments(parts, &mut attachments);
    }

    attachments
}

// 첨부파일 업로드용 구조체
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentUpload {
    pub filename: String,
    pub mime_type: String,
    pub data: String, // Base64 encoded
}

#[tauri::command]
async fn send_gmail(
    state: State<'_, GoogleAuthState>,
    to: String,
    subject: String,
    body: String,
    cc: Option<String>,
    bcc: Option<String>,
    attachments: Option<Vec<AttachmentUpload>>,
) -> Result<String, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    use base64::{Engine as _, engine::general_purpose};

    let email = if let Some(atts) = attachments.filter(|a| !a.is_empty()) {
        // MIME multipart 이메일 생성
        let boundary = format!("boundary_{}", chrono::Utc::now().timestamp_millis());
        let mut mime_parts = Vec::new();

        // 헤더
        let mut headers = format!(
            "To: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\n",
            to, subject
        );
        if let Some(ref cc_addr) = cc {
            if !cc_addr.is_empty() {
                headers.push_str(&format!("Cc: {}\r\n", cc_addr));
            }
        }
        if let Some(ref bcc_addr) = bcc {
            if !bcc_addr.is_empty() {
                headers.push_str(&format!("Bcc: {}\r\n", bcc_addr));
            }
        }
        headers.push_str(&format!("Content-Type: multipart/mixed; boundary=\"{}\"\r\n\r\n", boundary));
        mime_parts.push(headers);

        // 본문 파트
        mime_parts.push(format!(
            "--{}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}\r\n",
            boundary, body
        ));

        // 첨부파일 파트
        for att in atts {
            mime_parts.push(format!(
                "--{}\r\nContent-Type: {}; name=\"{}\"\r\nContent-Disposition: attachment; filename=\"{}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n{}\r\n",
                boundary, att.mime_type, att.filename, att.filename, att.data
            ));
        }

        mime_parts.push(format!("--{}--", boundary));
        mime_parts.join("")
    } else {
        // 단순 텍스트 이메일
        let mut email = format!("To: {}\r\n", to);
        if let Some(ref cc_addr) = cc {
            if !cc_addr.is_empty() {
                email.push_str(&format!("Cc: {}\r\n", cc_addr));
            }
        }
        if let Some(ref bcc_addr) = bcc {
            if !bcc_addr.is_empty() {
                email.push_str(&format!("Bcc: {}\r\n", bcc_addr));
            }
        }
        email.push_str(&format!("Subject: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}", subject, body));
        email
    };

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

// Gmail 중요 표시 (별표)
#[tauri::command]
async fn star_gmail_message(
    state: State<'_, GoogleAuthState>,
    message_id: String,
    starred: bool,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/modify",
        message_id
    );

    let body = if starred {
        serde_json::json!({ "addLabelIds": ["STARRED"] })
    } else {
        serde_json::json!({ "removeLabelIds": ["STARRED"] })
    };

    let response = client
        .post(&url)
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("중요 표시 실패: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("중요 표시 실패: {}", error_text))
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
async fn delete_gmail_message(
    state: State<'_, GoogleAuthState>,
    message_id: String,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/trash",
        message_id
    );

    let response = client
        .post(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("삭제 실패: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("삭제 실패: {}", error_text))
    }
}

#[tauri::command]
async fn archive_gmail_message(
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
        "removeLabelIds": ["INBOX"]
    });

    let response = client
        .post(&url)
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("보관 실패: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("보관 실패: {}", error_text))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct GmailAttachmentResponse {
    size: u64,
    data: String,
}

#[tauri::command]
async fn download_gmail_attachment(
    state: State<'_, GoogleAuthState>,
    app: tauri::AppHandle,
    message_id: String,
    attachment_id: String,
    filename: String,
) -> Result<String, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/attachments/{}",
        message_id, attachment_id
    );

    let response = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("첨부파일 다운로드 실패: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("첨부파일 다운로드 실패: {}", error_text));
    }

    let attachment_data: GmailAttachmentResponse = response
        .json()
        .await
        .map_err(|e| format!("첨부파일 파싱 실패: {}", e))?;

    // Base64 URL-safe 디코딩
    use base64::{Engine as _, engine::general_purpose};
    let decoded_data = attachment_data.data.replace('-', "+").replace('_', "/");
    let file_bytes = general_purpose::STANDARD
        .decode(&decoded_data)
        .map_err(|e| format!("Base64 디코딩 실패: {}", e))?;

    // 다운로드 폴더에 저장
    let download_dir = app.path().download_dir()
        .map_err(|_| "다운로드 폴더를 찾을 수 없습니다".to_string())?;

    let file_path = download_dir.join(&filename);
    fs::write(&file_path, &file_bytes)
        .map_err(|e| format!("파일 저장 실패: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
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
    let google_client_id = get_google_client_id();
    let google_client_secret = get_google_client_secret();
    let params = [
        ("client_id", google_client_id.as_str()),
        ("client_secret", google_client_secret.as_str()),
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

// === Outlook 관련 함수 ===

fn get_outlook_token_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("outlook_tokens.json"))
}

#[derive(Debug, Serialize, Deserialize)]
struct SavedOutlookTokens {
    access_token: String,
    refresh_token: Option<String>,
}

#[tauri::command]
async fn start_microsoft_auth(
    state: State<'_, MicrosoftAuthState>,
) -> Result<String, String> {
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&response_mode=query",
        MS_AUTH_URL,
        &get_ms_client_id(),
        urlencoding::encode(MS_REDIRECT_URI),
        urlencoding::encode(MS_SCOPES)
    );

    // 로컬 서버 시작 (포트 8586)
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)
        .map_err(|e| format!("소켓 생성 실패: {}", e))?;
    socket.set_reuse_address(true)
        .map_err(|e| format!("SO_REUSEADDR 설정 실패: {}", e))?;
    socket.set_read_timeout(Some(Duration::from_secs(120)))
        .map_err(|e| format!("타임아웃 설정 실패: {}", e))?;
    let addr: SocketAddr = "127.0.0.1:8586".parse().unwrap();
    socket.bind(&addr.into())
        .map_err(|e| format!("포트 바인딩 실패 (8586 포트가 사용 중일 수 있습니다): {}", e))?;
    socket.listen(1)
        .map_err(|e| format!("리슨 실패: {}", e))?;
    let listener: TcpListener = socket.into();
    listener.set_nonblocking(false).ok();

    webbrowser::open(&auth_url)
        .map_err(|e| format!("브라우저 열기 실패: {}", e))?;

    let (mut stream, _) = listener.accept()
        .map_err(|e| format!("인증 대기 시간 초과 또는 연결 실패: {}", e))?;

    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();

    let mut buffer = [0; 2048];
    stream.read(&mut buffer)
        .map_err(|e| format!("요청 읽기 실패: {}", e))?;

    let request = String::from_utf8_lossy(&buffer);

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

    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><h1>인증 완료!</h1><p>이 창을 닫고 앱으로 돌아가세요.</p><script>window.close();</script></body></html>";
    let _ = stream.write_all(response.as_bytes());

    // 토큰 교환
    let client = reqwest::Client::new();
    let ms_client_id = get_ms_client_id();
    let ms_client_secret = get_ms_client_secret();
    let params = [
        ("client_id", ms_client_id.as_str()),
        ("client_secret", ms_client_secret.as_str()),
        ("code", code.as_str()),
        ("redirect_uri", MS_REDIRECT_URI),
        ("grant_type", "authorization_code"),
    ];

    let token_response = client
        .post(MS_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("토큰 교환 실패: {}", e))?;

    let token_data: MicrosoftTokenResponse = token_response
        .json()
        .await
        .map_err(|e| format!("토큰 파싱 실패: {}", e))?;

    *state.access_token.lock().unwrap() = Some(token_data.access_token.clone());
    if let Some(ref refresh) = token_data.refresh_token {
        *state.refresh_token.lock().unwrap() = Some(refresh.clone());
    }

    Ok(token_data.access_token)
}

#[tauri::command]
async fn get_outlook_messages(
    state: State<'_, MicrosoftAuthState>,
    max_results: Option<u32>,
    search_query: Option<String>,
    skip: Option<u32>,
) -> Result<OutlookMessagesResult, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let max = max_results.unwrap_or(20);

    let mut url = format!(
        "https://graph.microsoft.com/v1.0/me/messages?$top={}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead,inferenceClassification,categories",
        max
    );

    if let Some(query) = &search_query {
        if !query.trim().is_empty() {
            url.push_str(&format!("&$search=\"{}\"", urlencoding::encode(query.trim())));
        }
    }

    if let Some(s) = skip {
        url.push_str(&format!("&$skip={}", s));
    }

    let response: OutlookListResponse = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("메일 목록 조회 실패: {}", e))?
        .json()
        .await
        .map_err(|e| format!("메일 목록 파싱 실패: {}", e))?;

    let messages: Vec<OutlookMessageSimple> = response.value.unwrap_or_default()
        .into_iter()
        .map(|m| {
            let from = m.from
                .and_then(|f| f.email_address)
                .map(|e| {
                    let name = e.name.unwrap_or_default();
                    let addr = e.address.unwrap_or_default();
                    if name.is_empty() { addr } else { format!("{} <{}>", name, addr) }
                })
                .unwrap_or_default();

            // Outlook 라벨 생성: inferenceClassification + categories
            let mut labels = m.categories;
            if let Some(classification) = m.inference_classification {
                labels.push(format!("INFERENCE_{}", classification.to_uppercase()));
            }

            OutlookMessageSimple {
                id: m.id,
                conversation_id: m.conversation_id.unwrap_or_default(),
                subject: m.subject.unwrap_or_default(),
                from,
                date: m.received_date_time.unwrap_or_default(),
                snippet: m.body_preview.unwrap_or_default(),
                body: None,
                is_unread: !m.is_read.unwrap_or(true),
                labels,
                attachments: Vec::new(), // 목록에서는 첨부파일 정보 생략
            }
        })
        .collect();

    Ok(OutlookMessagesResult {
        messages,
        next_link: response.next_link,
    })
}

#[tauri::command]
async fn get_outlook_message_detail(
    state: State<'_, MicrosoftAuthState>,
    message_id: String,
) -> Result<OutlookMessageSimple, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}?$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,body,isRead,inferenceClassification,categories",
        message_id
    );

    let m: OutlookMessage = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("메일 조회 실패: {}", e))?
        .json()
        .await
        .map_err(|e| format!("메일 파싱 실패: {}", e))?;

    let from = m.from
        .and_then(|f| f.email_address)
        .map(|e| {
            let name = e.name.unwrap_or_default();
            let addr = e.address.unwrap_or_default();
            if name.is_empty() { addr } else { format!("{} <{}>", name, addr) }
        })
        .unwrap_or_default();

    let body = m.body.and_then(|b| b.content);

    // Outlook 라벨 생성
    let mut labels = m.categories;
    if let Some(classification) = m.inference_classification {
        labels.push(format!("INFERENCE_{}", classification.to_uppercase()));
    }

    // 첨부파일 목록 가져오기
    let attachments_url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}/attachments?$select=id,name,contentType,size",
        message_id
    );

    let attachments = match client
        .get(&attachments_url)
        .bearer_auth(&access_token)
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(att_resp) = resp.json::<OutlookAttachmentsResponse>().await {
                att_resp.value.unwrap_or_default()
                    .into_iter()
                    .map(|a| Attachment {
                        id: a.id,
                        filename: a.name,
                        mime_type: a.content_type,
                        size: a.size,
                    })
                    .collect()
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    };

    Ok(OutlookMessageSimple {
        id: m.id,
        conversation_id: m.conversation_id.unwrap_or_default(),
        subject: m.subject.unwrap_or_default(),
        from,
        date: m.received_date_time.unwrap_or_default(),
        snippet: m.body_preview.unwrap_or_default(),
        body,
        is_unread: !m.is_read.unwrap_or(true),
        labels,
        attachments,
    })
}

#[tauri::command]
async fn send_outlook(
    state: State<'_, MicrosoftAuthState>,
    to: String,
    subject: String,
    body: String,
    cc: Option<String>,
    bcc: Option<String>,
    attachments: Option<Vec<AttachmentUpload>>,
) -> Result<String, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();

    let mut message = serde_json::json!({
        "subject": subject,
        "body": {
            "contentType": "Text",
            "content": body
        },
        "toRecipients": [
            {
                "emailAddress": {
                    "address": to
                }
            }
        ]
    });

    // CC 추가
    if let Some(ref cc_addr) = cc {
        if !cc_addr.is_empty() {
            let cc_recipients: Vec<serde_json::Value> = cc_addr
                .split(',')
                .map(|addr| serde_json::json!({
                    "emailAddress": { "address": addr.trim() }
                }))
                .collect();
            message["ccRecipients"] = serde_json::json!(cc_recipients);
        }
    }

    // BCC 추가
    if let Some(ref bcc_addr) = bcc {
        if !bcc_addr.is_empty() {
            let bcc_recipients: Vec<serde_json::Value> = bcc_addr
                .split(',')
                .map(|addr| serde_json::json!({
                    "emailAddress": { "address": addr.trim() }
                }))
                .collect();
            message["bccRecipients"] = serde_json::json!(bcc_recipients);
        }
    }

    // 첨부파일 추가
    if let Some(atts) = attachments.filter(|a| !a.is_empty()) {
        let attachments_json: Vec<serde_json::Value> = atts
            .into_iter()
            .map(|att| serde_json::json!({
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": att.filename,
                "contentType": att.mime_type,
                "contentBytes": att.data
            }))
            .collect();
        message["attachments"] = serde_json::json!(attachments_json);
    }

    let email_body = serde_json::json!({
        "message": message,
        "saveToSentItems": "true"
    });

    let response = client
        .post("https://graph.microsoft.com/v1.0/me/sendMail")
        .bearer_auth(&access_token)
        .json(&email_body)
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

// Outlook 중요 표시 (플래그)
#[tauri::command]
async fn flag_outlook_message(
    state: State<'_, MicrosoftAuthState>,
    message_id: String,
    flagged: bool,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}",
        message_id
    );

    let body = serde_json::json!({
        "flag": {
            "flagStatus": if flagged { "flagged" } else { "notFlagged" }
        }
    });

    let response = client
        .patch(&url)
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("플래그 설정 실패: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("플래그 설정 실패: {}", error_text))
    }
}

#[tauri::command]
async fn mark_outlook_as_read(
    state: State<'_, MicrosoftAuthState>,
    message_id: String,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}",
        message_id
    );

    let body = serde_json::json!({
        "isRead": true
    });

    let response = client
        .patch(&url)
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
async fn delete_outlook_message(
    state: State<'_, MicrosoftAuthState>,
    message_id: String,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}",
        message_id
    );

    let response = client
        .delete(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("삭제 실패: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("삭제 실패: {}", error_text))
    }
}

#[tauri::command]
async fn archive_outlook_message(
    state: State<'_, MicrosoftAuthState>,
    message_id: String,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();

    // Outlook에서는 Archive 폴더로 이동
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}/move",
        message_id
    );

    let body = serde_json::json!({
        "destinationId": "archive"
    });

    let response = client
        .post(&url)
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("보관 실패: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("보관 실패: {}", error_text))
    }
}

#[tauri::command]
async fn download_outlook_attachment(
    state: State<'_, MicrosoftAuthState>,
    app: tauri::AppHandle,
    message_id: String,
    attachment_id: String,
    filename: String,
) -> Result<String, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}/attachments/{}",
        message_id, attachment_id
    );

    let response = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("첨부파일 다운로드 실패: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("첨부파일 다운로드 실패: {}", error_text));
    }

    let attachment: OutlookAttachment = response
        .json()
        .await
        .map_err(|e| format!("첨부파일 파싱 실패: {}", e))?;

    let content_bytes = attachment.content_bytes
        .ok_or("첨부파일 데이터가 없습니다")?;

    // Base64 디코딩
    use base64::{Engine as _, engine::general_purpose};
    let file_bytes = general_purpose::STANDARD
        .decode(&content_bytes)
        .map_err(|e| format!("Base64 디코딩 실패: {}", e))?;

    // 다운로드 폴더에 저장
    let download_dir = app.path().download_dir()
        .map_err(|_| "다운로드 폴더를 찾을 수 없습니다".to_string())?;

    let file_path = download_dir.join(&filename);
    fs::write(&file_path, &file_bytes)
        .map_err(|e| format!("파일 저장 실패: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn is_outlook_authenticated(state: State<'_, MicrosoftAuthState>) -> bool {
    state.access_token.lock().unwrap().is_some()
}

#[tauri::command]
fn logout_outlook(state: State<'_, MicrosoftAuthState>, app: tauri::AppHandle) {
    *state.access_token.lock().unwrap() = None;
    *state.refresh_token.lock().unwrap() = None;
    if let Some(token_path) = get_outlook_token_path(&app) {
        let _ = fs::remove_file(token_path);
    }
}

#[tauri::command]
fn save_outlook_tokens(
    state: State<'_, MicrosoftAuthState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let access_token = state.access_token.lock().unwrap().clone();
    let refresh_token = state.refresh_token.lock().unwrap().clone();

    if let Some(access) = access_token {
        let tokens = SavedOutlookTokens {
            access_token: access,
            refresh_token,
        };

        if let Some(token_path) = get_outlook_token_path(&app) {
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
fn load_outlook_tokens(
    state: State<'_, MicrosoftAuthState>,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    if let Some(token_path) = get_outlook_token_path(&app) {
        if token_path.exists() {
            let json = fs::read_to_string(&token_path).map_err(|e| e.to_string())?;
            let tokens: SavedOutlookTokens = serde_json::from_str(&json).map_err(|e| e.to_string())?;

            *state.access_token.lock().unwrap() = Some(tokens.access_token);
            *state.refresh_token.lock().unwrap() = tokens.refresh_token;

            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
async fn refresh_outlook_token(
    state: State<'_, MicrosoftAuthState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let refresh_token = state.refresh_token.lock().unwrap().clone()
        .ok_or("리프레시 토큰이 없습니다. 다시 로그인해주세요.")?;

    let client = reqwest::Client::new();
    let ms_client_id = get_ms_client_id();
    let ms_client_secret = get_ms_client_secret();
    let params = [
        ("client_id", ms_client_id.as_str()),
        ("client_secret", ms_client_secret.as_str()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
        ("scope", MS_SCOPES),
    ];

    let response = client
        .post(MS_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("토큰 갱신 요청 실패: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("토큰 갱신 실패: {}. 다시 로그인해주세요.", error_text));
    }

    let token_data: MicrosoftTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("토큰 파싱 실패: {}", e))?;

    *state.access_token.lock().unwrap() = Some(token_data.access_token.clone());
    if let Some(ref new_refresh) = token_data.refresh_token {
        *state.refresh_token.lock().unwrap() = Some(new_refresh.clone());
    }

    // 파일에도 저장
    let access = token_data.access_token.clone();
    let refresh = state.refresh_token.lock().unwrap().clone();
    let tokens = SavedOutlookTokens {
        access_token: access.clone(),
        refresh_token: refresh,
    };
    if let Some(token_path) = get_outlook_token_path(&app) {
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

// === 예약 이메일 관련 ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledEmail {
    pub id: i64,
    pub provider: String,        // "gmail" or "outlook"
    pub to: String,
    pub subject: String,
    pub body: String,
    pub scheduled_at: String,    // ISO 8601 format
    pub status: String,          // "pending", "sent", "failed"
    pub created_at: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScheduledEmail {
    pub provider: String,
    pub to: String,
    pub subject: String,
    pub body: String,
    pub scheduled_at: String,
}

fn get_scheduled_db_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("scheduled_emails.db"))
}

fn init_scheduled_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = get_scheduled_db_path(app)
        .ok_or("데이터 디렉토리를 찾을 수 없습니다")?;

    if let Some(parent) = db_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("데이터베이스 열기 실패: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS scheduled_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            to_addr TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            scheduled_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            error_message TEXT
        )",
        [],
    ).map_err(|e| format!("테이블 생성 실패: {}", e))?;

    Ok(conn)
}

#[tauri::command]
fn create_scheduled_email(
    app: tauri::AppHandle,
    email: CreateScheduledEmail,
) -> Result<ScheduledEmail, String> {
    let conn = init_scheduled_db(&app)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO scheduled_emails (provider, to_addr, subject, body, scheduled_at, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)",
        params![email.provider, email.to, email.subject, email.body, email.scheduled_at, now],
    ).map_err(|e| format!("예약 저장 실패: {}", e))?;

    let id = conn.last_insert_rowid();

    Ok(ScheduledEmail {
        id,
        provider: email.provider,
        to: email.to,
        subject: email.subject,
        body: email.body,
        scheduled_at: email.scheduled_at,
        status: "pending".to_string(),
        created_at: now,
        error_message: None,
    })
}

#[tauri::command]
fn get_scheduled_emails(app: tauri::AppHandle) -> Result<Vec<ScheduledEmail>, String> {
    let conn = init_scheduled_db(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, provider, to_addr, subject, body, scheduled_at, status, created_at, error_message
         FROM scheduled_emails ORDER BY scheduled_at ASC"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let emails = stmt.query_map([], |row| {
        Ok(ScheduledEmail {
            id: row.get(0)?,
            provider: row.get(1)?,
            to: row.get(2)?,
            subject: row.get(3)?,
            body: row.get(4)?,
            scheduled_at: row.get(5)?,
            status: row.get(6)?,
            created_at: row.get(7)?,
            error_message: row.get(8)?,
        })
    }).map_err(|e| format!("쿼리 실행 실패: {}", e))?;

    let result: Vec<ScheduledEmail> = emails
        .filter_map(|e| e.ok())
        .collect();

    Ok(result)
}

#[tauri::command]
fn delete_scheduled_email(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let conn = init_scheduled_db(&app)?;

    conn.execute(
        "DELETE FROM scheduled_emails WHERE id = ?1",
        params![id],
    ).map_err(|e| format!("삭제 실패: {}", e))?;

    Ok(())
}

#[tauri::command]
fn update_scheduled_email(
    app: tauri::AppHandle,
    id: i64,
    email: CreateScheduledEmail,
) -> Result<(), String> {
    let conn = init_scheduled_db(&app)?;

    conn.execute(
        "UPDATE scheduled_emails SET provider = ?1, to_addr = ?2, subject = ?3, body = ?4, scheduled_at = ?5
         WHERE id = ?6 AND status = 'pending'",
        params![email.provider, email.to, email.subject, email.body, email.scheduled_at, id],
    ).map_err(|e| format!("업데이트 실패: {}", e))?;

    Ok(())
}

// 예약된 이메일 발송 체크 (프론트엔드에서 주기적으로 호출)
#[tauri::command]
async fn check_and_send_scheduled_emails(
    app: tauri::AppHandle,
    google_state: State<'_, GoogleAuthState>,
    ms_state: State<'_, MicrosoftAuthState>,
) -> Result<Vec<i64>, String> {
    // 데이터베이스 작업을 별도 블록으로 분리 (Send 트레잇 문제 해결)
    let pending: Vec<(i64, String, String, String, String)> = {
        let conn = init_scheduled_db(&app)?;
        let now = Utc::now().to_rfc3339();

        let mut stmt = conn.prepare(
            "SELECT id, provider, to_addr, subject, body FROM scheduled_emails
             WHERE status = 'pending' AND scheduled_at <= ?1"
        ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

        let rows = stmt.query_map(params![now], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }).map_err(|e| format!("쿼리 실행 실패: {}", e))?;

        let result: Vec<_> = rows.filter_map(|e| e.ok()).collect();
        result
    };

    let mut sent_ids = Vec::new();

    for (id, provider, to, subject, body) in pending {
        let result = if provider == "gmail" {
            send_gmail_internal(&google_state, &to, &subject, &body).await
        } else {
            send_outlook_internal(&ms_state, &to, &subject, &body).await
        };

        // 결과 업데이트도 별도 블록
        {
            let conn = init_scheduled_db(&app)?;
            match &result {
                Ok(_) => {
                    conn.execute(
                        "UPDATE scheduled_emails SET status = 'sent' WHERE id = ?1",
                        params![id],
                    ).ok();
                    sent_ids.push(id);
                }
                Err(e) => {
                    conn.execute(
                        "UPDATE scheduled_emails SET status = 'failed', error_message = ?1 WHERE id = ?2",
                        params![e.clone(), id],
                    ).ok();
                }
            }
        }
    }

    Ok(sent_ids)
}

// Gmail 내부 발송 함수
async fn send_gmail_internal(
    state: &State<'_, GoogleAuthState>,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<String, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Gmail 로그인이 필요합니다")?;

    let client = reqwest::Client::new();

    let email = format!(
        "To: {}\r\nSubject: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}",
        to, subject, body
    );

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

// Outlook 내부 발송 함수
async fn send_outlook_internal(
    state: &State<'_, MicrosoftAuthState>,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<String, String> {
    let access_token = state.access_token.lock().unwrap().clone()
        .ok_or("Outlook 로그인이 필요합니다")?;

    let client = reqwest::Client::new();

    let email_body = serde_json::json!({
        "message": {
            "subject": subject,
            "body": {
                "contentType": "Text",
                "content": body
            },
            "toRecipients": [
                {
                    "emailAddress": {
                        "address": to
                    }
                }
            ]
        },
        "saveToSentItems": "true"
    });

    let response = client
        .post("https://graph.microsoft.com/v1.0/me/sendMail")
        .bearer_auth(&access_token)
        .json(&email_body)
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

// === 백그라운드 스케줄러 ===

// 토큰으로 직접 Gmail 발송
async fn send_gmail_with_token(
    access_token: &str,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let email = format!(
        "To: {}\r\nSubject: {}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}",
        to, subject, body
    );

    use base64::{Engine as _, engine::general_purpose};
    let encoded = general_purpose::URL_SAFE_NO_PAD.encode(email.as_bytes());

    let send_body = serde_json::json!({
        "raw": encoded
    });

    let response = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(access_token)
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

// 토큰으로 직접 Outlook 발송
async fn send_outlook_with_token(
    access_token: &str,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let email_body = serde_json::json!({
        "message": {
            "subject": subject,
            "body": {
                "contentType": "Text",
                "content": body
            },
            "toRecipients": [
                {
                    "emailAddress": {
                        "address": to
                    }
                }
            ]
        },
        "saveToSentItems": "true"
    });

    let response = client
        .post("https://graph.microsoft.com/v1.0/me/sendMail")
        .bearer_auth(access_token)
        .json(&email_body)
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

// 백그라운드에서 예약 이메일 발송 체크
async fn background_check_scheduled(app: AppHandle) {
    // DB에서 pending 상태이고 시간이 된 이메일 조회
    let pending: Vec<(i64, String, String, String, String)> = {
        let conn = match init_scheduled_db(&app) {
            Ok(c) => c,
            Err(_) => return,
        };
        let now = Utc::now().to_rfc3339();

        let mut stmt = match conn.prepare(
            "SELECT id, provider, to_addr, subject, body FROM scheduled_emails
             WHERE status = 'pending' AND scheduled_at <= ?1"
        ) {
            Ok(s) => s,
            Err(_) => return,
        };

        let rows = match stmt.query_map(params![now], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }) {
            Ok(r) => r,
            Err(_) => return,
        };

        rows.filter_map(|e| e.ok()).collect()
    };

    if pending.is_empty() {
        return;
    }

    // State에서 토큰 가져오기
    let google_state = app.state::<GoogleAuthState>();
    let ms_state = app.state::<MicrosoftAuthState>();

    let gmail_token = google_state.access_token.lock().unwrap().clone();
    let outlook_token = ms_state.access_token.lock().unwrap().clone();

    for (id, provider, to, subject, body) in pending {
        let result = if provider == "gmail" {
            if let Some(ref token) = gmail_token {
                send_gmail_with_token(token, &to, &subject, &body).await
            } else {
                Err("Gmail 로그인이 필요합니다".to_string())
            }
        } else {
            if let Some(ref token) = outlook_token {
                send_outlook_with_token(token, &to, &subject, &body).await
            } else {
                Err("Outlook 로그인이 필요합니다".to_string())
            }
        };

        // 결과 업데이트
        if let Ok(conn) = init_scheduled_db(&app) {
            match &result {
                Ok(_) => {
                    conn.execute(
                        "UPDATE scheduled_emails SET status = 'sent' WHERE id = ?1",
                        params![id],
                    ).ok();
                    // 프론트엔드에 알림
                    let _ = app.emit("scheduled-email-sent", id);
                }
                Err(e) => {
                    conn.execute(
                        "UPDATE scheduled_emails SET status = 'failed', error_message = ?1 WHERE id = ?2",
                        params![e.clone(), id],
                    ).ok();
                    let _ = app.emit("scheduled-email-failed", serde_json::json!({"id": id, "error": e}));
                }
            }
        }
    }
}

// 백그라운드 스케줄러 시작
fn start_background_scheduler(app: AppHandle) {
    let app_handle = app.clone();

    // Tauri의 async runtime 사용
    tauri::async_runtime::spawn(async move {
        loop {
            // 1분 대기
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

            // 예약 이메일 체크 및 발송
            background_check_scheduled(app_handle.clone()).await;
        }
    });
}

pub fn run() {
    // .env 파일에서 환경변수 로드 (개발 환경)
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .manage(GoogleAuthState::default())
        .manage(MicrosoftAuthState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
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

            // 백그라운드 스케줄러 시작 (예약 이메일 발송)
            start_background_scheduler(app.handle().clone());

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
            delete_gmail_message,
            archive_gmail_message,
            download_gmail_attachment,
            star_gmail_message,
            is_gmail_authenticated,
            set_gmail_tokens,
            logout_gmail,
            save_gmail_tokens,
            load_gmail_tokens,
            refresh_gmail_token,
            // 이메일 캐시
            save_email_cache,
            load_email_cache,
            clear_email_cache,
            // Outlook 관련
            start_microsoft_auth,
            get_outlook_messages,
            get_outlook_message_detail,
            send_outlook,
            mark_outlook_as_read,
            delete_outlook_message,
            archive_outlook_message,
            download_outlook_attachment,
            flag_outlook_message,
            is_outlook_authenticated,
            logout_outlook,
            save_outlook_tokens,
            load_outlook_tokens,
            refresh_outlook_token,
            // 예약 이메일 관련
            create_scheduled_email,
            get_scheduled_emails,
            delete_scheduled_email,
            update_scheduled_email,
            check_and_send_scheduled_emails
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
