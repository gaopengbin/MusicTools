use tauri::Manager;
use std::sync::Mutex;
use std::process::{Command, Child};

struct BackendProcess(Mutex<Option<Child>>);

impl Drop for BackendProcess {
  fn drop(&mut self) {
    if let Some(mut child) = self.0.lock().unwrap().take() {
      let _ = child.kill();
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(BackendProcess(Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Determine backend directory
      // exe is at: frontend/src-tauri/target/debug/app.exe
      // backend is at: backend/ (4 levels up from exe dir)
      let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

      let candidates = vec![
        exe_dir.join("backend"),                                                        // bundled next to exe
        exe_dir.join("..").join("..").join("..").join("..").join("backend"),             // debug: target/debug -> frontend/src-tauri -> frontend -> MusicTools
        std::env::current_dir().unwrap_or_default().join("..").join("backend"),
        std::env::current_dir().unwrap_or_default().join("backend"),
      ];

      let backend_dir = candidates.into_iter()
        .find(|p| p.join("main.py").exists());

      if backend_dir.is_none() {
        log::warn!("Could not find backend directory (main.py). Searched near exe: {:?}", exe_dir);
      }

      let backend_dir = backend_dir.unwrap_or_else(|| exe_dir.join("backend"));
      log::info!("Backend directory: {:?}", backend_dir);

      // Use venv Python if available, otherwise fall back to system Python
      let venv_python = backend_dir.join("venv").join("Scripts").join("python.exe");
      let python_cmd = if venv_python.exists() {
        venv_python.to_string_lossy().to_string()
      } else {
        "python".to_string()
      };
      log::info!("Python command: {}", python_cmd);

      // Launch Python backend
      let result = Command::new(&python_cmd)
        .arg("main.py")
        .current_dir(&backend_dir)
        .spawn();

      match result {
        Ok(child) => {
          log::info!("Python backend started (pid: {})", child.id());
          let state: tauri::State<BackendProcess> = app.state();
          *state.0.lock().unwrap() = Some(child);
        }
        Err(e) => {
          log::warn!("Failed to start Python backend: {}. Please start it manually.", e);
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
