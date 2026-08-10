import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { fetchRepositories, fetchUser, extractZip, extractFolder, filesFromDataTransferItems, uploadToGitHub, ExtractedFile, fetchRepoTree, deleteRepoPaths, deleteRepository, createRepository, logout as apiLogout, RepoTreeEntry } from "./lib/github";
import { sanitizeFiles } from "./lib/secretScanner";
import { buildTree, isPathCovered, toggleSelection, TreeNode } from "./lib/fileTree";
import { Github, LogOut, Upload, Loader2, CheckCircle, BookOpen, Archive, AlertCircle, FileArchive, X, ChevronDown, ChevronUp, Folder, File as FileIcon, Trash2, ShieldCheck, GitBranch, Zap, Plus, Lock, Globe } from "lucide-react";

// Sentinel value for the "Create New Repository" option in the repo <select>.
// Never a real full_name, so it can't collide with an actual repo.
const CREATE_NEW_REPO_VALUE = "__create_new_repo__";

// Suggests the next free "ziptogit.in_newN" name given the user's existing
// repos, so the default we show never collides with one they already have.
function suggestRepoName(existingRepos: any[]): string {
  const takenNames = new Set(existingRepos.map((r) => String(r.name).toLowerCase()));
  let i = 1;
  while (takenNames.has(`ziptogit.in_new${i}`.toLowerCase())) i++;
  return `ziptogit.in_new${i}`;
}

// GitHub repo names allow letters, numbers, '.', '-', '_' only.
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

// --- Custom Event Tracking Wrapper --- //
function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", eventName, params);
  }
}

function FileTreeView({
  nodes,
  selected,
  onToggle,
  depth = 0,
}: {
  nodes: TreeNode[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const isCovered = (path: string): boolean => isPathCovered(path, selected);

  return (
    <div className={depth > 0 ? "ml-4 border-l border-slate-100 pl-2" : ""}>
      {[...nodes]
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map((node) => {
          const covered = isCovered(node.path);
          const explicitlySelected = selected.has(node.path);
          const isCollapsed = collapsed.has(node.path);
          return (
            <div key={node.path}>
              <div className="flex items-center gap-2 py-1 text-sm">
                {node.type === "tree" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(collapsed);
                      if (isCollapsed) next.delete(node.path); else next.add(node.path);
                      setCollapsed(next);
                    }}
                    aria-label={isCollapsed ? `Expand ${node.name} folder` : `Collapse ${node.name} folder`}
                    aria-expanded={!isCollapsed}
                    className="text-slate-400 hover:text-slate-600 shrink-0"
                  >
                    {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <span className="w-3.5 h-3.5 shrink-0" />
                )}
                <input
                  id={`file-tree-cb-${node.path}`}
                  type="checkbox"
                  checked={covered}
                  disabled={covered && !explicitlySelected}
                  onChange={() => onToggle(node.path)}
                  className="shrink-0 cursor-pointer disabled:cursor-not-allowed accent-slate-800"
                />
                <label
                  htmlFor={`file-tree-cb-${node.path}`}
                  className="flex items-center gap-2 min-w-0 cursor-pointer"
                >
                  {node.type === "tree" ? (
                    <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <FileIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className={`truncate ${covered ? "text-red-600 line-through" : "text-slate-700"}`}>
                    {node.name}
                  </span>
                </label>
              </div>
              {node.type === "tree" && !isCollapsed && node.children.length > 0 && (
                <FileTreeView nodes={node.children} selected={selected} onToggle={onToggle} depth={depth + 1} />
              )}
            </div>
          );
        })}
    </div>
  );
}

// --- Layout & Presentational Components --- //
function Footer() {
  return (
    <footer className="mt-16 py-8 border-t border-slate-200 bg-white text-center flex flex-col items-center">
      <div className="flex gap-4 mb-3 text-xs text-slate-500">
        <Link to="/how-it-works" className="hover:text-slate-600 transition-colors">How It Works</Link>
        <span>&middot;</span>
        <Link to="/faq" className="hover:text-slate-600 transition-colors">FAQ</Link>
        <span>&middot;</span>
        <Link to="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
        <span>&middot;</span>
        <Link to="/terms" className="hover:text-slate-600 transition-colors">Terms</Link>
        <span>&middot;</span>
        <Link to="/contact" className="hover:text-slate-600 transition-colors">Contact</Link>
      </div>
      <p className="text-[11px] text-slate-500">© {new Date().getFullYear()} ZiptoGit. Created by Dipesh Nalawade.</p>
    </footer>
  );
}

function PageLayout({ children, title }: { children: React.ReactNode, title?: string }) {
  usePageTracking(title);

  return (
    <div className="min-h-dvh bg-[#F6F5F0] flex flex-col font-sans text-slate-900">
      <header className="flex items-center px-6 py-6 max-w-6xl w-full mx-auto">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#0B1120] rounded-lg flex items-center justify-center">
            <Github className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight text-[15px] text-[#0B1120]">ZiptoGit</span>
        </Link>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {children}
      </div>
      <Footer />
    </div>
  );
}

// Tracks page views (GA) and sets the document title. Shared by PageLayout
// (content pages) and HomeLayout (the main app screen), which has its own
// wider desktop shell but needs the same tracking behavior.
function usePageTracking(title?: string) {
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).gtag) {
      const configObj: any = { page_path: window.location.pathname };
      if (title) configObj.page_title = title;
      (window as any).gtag("config", (window as any).VITE_GA_MEASUREMENT_ID || 'G-TRACKING_ID', configObj);
    }
    if (title) document.title = `${title} | ZiptoGit`;
  }, [title]);
}

// --- Signature showcase animation: a looping, staged sequence (read archive →
// extract → git init → stage → commit → push) rendered as a dark terminal
// card, matching the rest of the app's dark-terminal accent. Replaces the old
// one-shot "unpack" animation with something that keeps demonstrating the
// product's mechanic for as long as someone looks at it. Respects
// prefers-reduced-motion (see index.css). --- //
type ZtgStage = { id: string; label: string; target: number; lines: string[] };

const ZTG_STAGES: ZtgStage[] = [
  { id: "read", label: "Reading archive", target: 12, lines: ["$ ziptogit push export.zip", "reading export.zip (2.8 MB)…"] },
  { id: "unzip", label: "Extracting files", target: 38, lines: ["inflating: src/App.tsx", "inflating: src/components/Nav.tsx", "inflating: package.json", "inflating: README.md"] },
  { id: "init", label: "Initializing repo", target: 55, lines: ["$ git init", "Initialized empty Git repository in .git/"] },
  { id: "stage", label: "Staging changes", target: 74, lines: ["$ git add .", "42 files staged"] },
  { id: "commit", label: "Creating commit", target: 90, lines: ["$ git commit -m \"Upload files via ZiptoGit\"", "[main a1f9c3e] Upload files via ZiptoGit"] },
  { id: "push", label: "Pushing to remote", target: 100, lines: ["$ git push -u origin main", "To github.com:you/your-repo.git"] },
];

const ZTG_FILES = ["App.tsx", "Nav.tsx", "package.json", "README.md"];

function ZipToGitTerminal() {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [cycle, setCycle] = useState(0);
  const rafRef = useRef<number | null>(null);

  const stage = ZTG_STAGES[stageIndex];
  const extracted = stageIndex >= 1;
  const committed = stageIndex >= 4;

  // Advance through stages, appending log lines, then loop back to the start.
  useEffect(() => {
    setLog((prev) => [...prev, ...stage.lines]);
    const holdMs = 1400;
    const timer = window.setTimeout(() => {
      if (stageIndex < ZTG_STAGES.length - 1) {
        setStageIndex((i) => i + 1);
      } else {
        setDone(true);
        const restart = window.setTimeout(() => {
          setStageIndex(0);
          setProgress(0);
          setLog([]);
          setDone(false);
          setCycle((c) => c + 1);
        }, 2600);
        return () => window.clearTimeout(restart);
      }
    }, holdMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIndex, cycle]);

  // Ease the progress bar toward the current stage's target.
  useEffect(() => {
    const animate = () => {
      setProgress((p) => {
        const diff = stage.target - p;
        if (Math.abs(diff) < 0.4) return stage.target;
        return p + diff * 0.08;
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stage.target]);

  return (
    <div className="rounded-2xl bg-[#0D1117] border border-white/10 shadow-2xl shadow-slate-900/10 overflow-hidden font-mono">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[11.5px] text-slate-500 truncate">export.zip → your-repo</span>
      </div>

      {/* Files/graph area — swaps from file chips to a small commit graph once committed */}
      <div className="px-4 pt-4 pb-3 min-h-[132px]">
        {!committed ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-amber-400 text-[12px] mb-2">
              <FileArchive className="w-3.5 h-3.5" />
              export.zip
            </div>
            {ZTG_FILES.map((f, i) => (
              <div
                key={`${cycle}-${f}`}
                className="flex items-center gap-2 text-[12px] text-slate-300 bg-white/[0.03] border border-white/[0.05] rounded-md px-2.5 py-1.5"
                style={
                  extracted
                    ? { animation: "ztg-chip-in 0.4s ease-out both", animationDelay: `${i * 90}ms` }
                    : { opacity: 0.25 }
                }
              >
                <FileIcon className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{f}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[11.5px] text-emerald-400 mb-0.5">
              <GitBranch className="w-3.5 h-3.5" />
              main
            </div>
            <div className="relative pl-5">
              <span className="absolute bottom-1.5 left-[5px] top-1.5 w-px bg-white/10" />
              {["a1f9c3e"].map((sha, i) => (
                <div
                  key={`${cycle}-${sha}`}
                  className="relative flex items-center gap-2.5 text-[12px]"
                  style={{ animation: "ztg-line-in 0.4s ease-out both", animationDelay: `${i * 160}ms` }}
                >
                  <span
                    className="absolute -left-5 h-2.5 w-2.5 rounded-full border-2 border-[#0D1117] bg-emerald-500 shadow-[0_0_6px_-1px_rgba(16,185,129,0.9)]"
                    style={{ animation: "ztg-node-pop 0.45s ease-out both", animationDelay: `${i * 160}ms` }}
                  />
                  <span className="text-emerald-400">{sha}</span>
                  <span className="text-slate-500 truncate">Upload files via ZiptoGit</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Terminal log — last few lines, blinking cursor at the end */}
      <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.02] min-h-[90px]">
        <div className="flex flex-col gap-1 text-[11.5px] leading-relaxed">
          {log.slice(-4).map((line, i) => (
            <p
              key={`${cycle}-${i}-${line}`}
              className={line.startsWith("$") ? "text-emerald-400 truncate" : "text-slate-500 truncate"}
              style={{ animation: "ztg-line-in 0.3s ease-out both" }}
            >
              {line}
            </p>
          ))}
          <p>
            <span
              className="inline-block h-3 w-1.5 translate-y-0.5 bg-emerald-400"
              style={{ animation: "ztg-blink 1s steps(1) infinite" }}
            />
          </p>
        </div>
      </div>

      {/* Progress + stage list */}
      <div className="border-t border-white/[0.06] px-4 py-4">
        <div className="flex items-center justify-between text-[11px] mb-2">
          <span className="text-slate-300">{done ? "Repository ready" : stage.label}</span>
          <span className="text-emerald-400">{Math.round(progress)}%</span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-emerald-500 shadow-[0_0_6px_-1px_rgba(16,185,129,0.9)] transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
          {/* faint segment ticks for a bit of technical texture, no scanlines/glow-frame */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, transparent 0, transparent 9%, #0D1117 9%, #0D1117 10%)",
            }}
          />
        </div>
        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[10.5px]">
          {ZTG_STAGES.map((s, i) => {
            const active = i === stageIndex;
            const complete = i < stageIndex || done;
            return (
              <li key={s.id} className="flex items-center gap-1.5">
                <span
                  className={`relative flex h-1.5 w-1.5 rounded-full ${
                    complete ? "bg-emerald-400" : active ? "bg-emerald-500 shadow-[0_0_6px_-1px_rgba(16,185,129,0.9)]" : "bg-white/15"
                  }`}
                >
                  {active && !done && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ animation: "ztg-pulse-ring 1.2s ease-out infinite" }}
                    />
                  )}
                </span>
                <span className={complete ? "text-emerald-400" : active ? "text-slate-300" : "text-slate-600"}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// --- Desktop showcase: the wide-screen companion panel next to the app card --- //
// Mobile is untouched — this only renders at lg+ (see the `hidden lg:flex` on
// its root). It exists purely to give laptop/desktop viewports something
// intentional to look at instead of a small card floating in empty space.
function DesktopShowcase() {
  const features = [
    { icon: ShieldCheck, text: "Secrets are scanned and redacted automatically before every push" },
    { icon: GitBranch, text: "Browse, delete, or wipe repo files and folders without leaving the browser" },
    { icon: Zap, text: "No local Git, no CLI — connect once with GitHub and start pushing" },
  ];

  return (
    <div className="hidden lg:flex flex-col gap-10 max-w-[440px] shrink-0">
      <div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          No git CLI required
        </span>
        <h1 className="text-[2.5rem] leading-[1.1] font-semibold tracking-tight text-[#0B1120] mb-4">
          Ship your ZIP export<br />to GitHub in one<br />clean commit.
        </h1>
        <p className="text-slate-500 text-[15px] leading-relaxed max-w-[400px]">
          Drop the ZIP from your AI builder of choice. We unzip it in your browser, scrub out anything that looks like a secret, and push it straight to your repo.
        </p>
      </div>

      {/* Signature element: a looping staged sequence — read → extract → init →
          stage → commit → push — cycling for as long as someone looks at it.
          Respects prefers-reduced-motion (see index.css). */}
      <ZipToGitTerminal />

      <div className="flex flex-col gap-4">
        {features.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
              <f.icon className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-slate-600 text-[13.5px] leading-relaxed pt-1.5">{f.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Home screen shell: full-width desktop layout with the showcase panel
// alongside the app card. Below lg, this collapses to exactly the original
// single centered-card mobile layout (DesktopShowcase renders nothing). --- //
function HomeLayout() {
  usePageTracking("Home");

  return (
    <div className="min-h-dvh flex flex-col font-sans text-slate-900 bg-[#F6F5F0] relative">
      {/* Faint dot-grid texture fills the desktop canvas outside the two
          columns. Purely decorative, never rendered below lg, and kept subtle
          enough not to compete with the content. */}
      <div
        className="hidden lg:block absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(15,23,42,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 0%, transparent 75%)",
        }}
      />

      <header className="hidden lg:flex items-center justify-between max-w-6xl w-full mx-auto px-8 py-7 relative">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#0B1120] rounded-lg flex items-center justify-center">
            <Github className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight text-[15px] text-[#0B1120]">ZiptoGit</span>
        </Link>
        <nav className="flex items-center gap-7 text-[13.5px] text-slate-500">
          <Link to="/how-it-works" className="hover:text-slate-900 transition-colors">How it works</Link>
          <Link to="/privacy" className="hover:text-slate-900 transition-colors">Privacy</Link>
          <Link to="/contact" className="hover:text-slate-900 transition-colors">Contact</Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-16 xl:gap-24 px-4 py-10 lg:px-8 lg:py-8 relative">
        <DesktopShowcase />
        <ZipUploader />
      </main>

      <Footer />
    </div>
  );
}

export function ZipUploader() {
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepoFullId, setSelectedRepoFullId] = useState<string>("");

  // --- Create a new repository directly from the dropdown --- //
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoIsPrivate, setNewRepoIsPrivate] = useState(false); // defaults to public
  const [isSubmittingNewRepo, setIsSubmittingNewRepo] = useState(false);
  const [createRepoErrorMsg, setCreateRepoErrorMsg] = useState<string | null>(null);
  
  // Tracks whichever source is currently loaded — a ZIP file or a picked/dropped
  // folder — since both feed the same extractedFiles pipeline below.
  const [selectedSource, setSelectedSource] = useState<{ kind: "zip" | "folder"; name: string } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractingName, setExtractingName] = useState("");
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadSuccessUrl, setUploadSuccessUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secretWarningMsg, setSecretWarningMsg] = useState<string | null>(null);

  // --- File/folder deletion (manage existing repo contents) --- //
  const [showFileManager, setShowFileManager] = useState(false);
  const [repoTree, setRepoTree] = useState<RepoTreeEntry[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [treeErrorMsg, setTreeErrorMsg] = useState<string | null>(null);
  const [selectedDeletePaths, setSelectedDeletePaths] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStatusMsg, setDeleteStatusMsg] = useState("");
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);

  // --- Delete entire repository (danger zone) --- //
  const [showDeleteRepoConfirm, setShowDeleteRepoConfirm] = useState(false);
  const [deleteRepoConfirmText, setDeleteRepoConfirmText] = useState("");
  const [isDeletingRepo, setIsDeletingRepo] = useState(false);
  const [deleteRepoErrorMsg, setDeleteRepoErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // On mount, check whether we already have a valid session cookie
    // (set HttpOnly by the server — this call is the only way to find out,
    // since client-side JS can't read the cookie itself).
    loadUserData().finally(() => setIsCheckingAuth(false));

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        // State validation now happens server-side in /auth/callback (bound
        // to a signed, HttpOnly cookie set by /api/auth/url) before the
        // session cookie is ever set, so a forged callback never gets here
        // with OAUTH_AUTH_SUCCESS in the first place.
        loadUserData();
      }
    };
    
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const loadUserData = async () => {
    try {
      const pUser = await fetchUser();
      setUser(pUser);
      const pRepos = await fetchRepositories();
      setRepos(pRepos);
      if (pRepos.length > 0 && !selectedRepoFullId) {
        setSelectedRepoFullId(pRepos[0].full_name);
      }
    } catch (err: any) {
      if (err.status === 401) {
        // Not signed in yet — this is the expected state before connecting GitHub.
        setUser(null);
      } else {
        console.error(err);
        setErrorMsg("Failed to load GitHub user data.");
      }
    }
  };

  // Resets everything tied to "which repo is selected" — shared by both the
  // normal repo-switch path and the newly-created-repo path so they can't
  // drift out of sync with each other.
  const resetRepoScopedState = () => {
    setUploadSuccessUrl(null);
    setShowFileManager(false);
    setRepoTree([]);
    setSelectedDeletePaths(new Set());
    setDeleteSuccessMsg(null);
    setTreeErrorMsg(null);
    setShowDeleteRepoConfirm(false);
    setDeleteRepoConfirmText("");
    setDeleteRepoErrorMsg(null);
  };

  const handleRepoSelectChange = (value: string) => {
    if (value === CREATE_NEW_REPO_VALUE) {
      setCreateRepoErrorMsg(null);
      setNewRepoName(suggestRepoName(repos));
      setNewRepoIsPrivate(false);
      setIsCreatingRepo(true);
      return;
    }
    setIsCreatingRepo(false);
    setSelectedRepoFullId(value);
    resetRepoScopedState();
  };

  const handleCancelCreateRepo = () => {
    setIsCreatingRepo(false);
    setCreateRepoErrorMsg(null);
  };

  const handleCreateRepo = async () => {
    const name = newRepoName.trim();
    if (!name) {
      setCreateRepoErrorMsg("Please enter a repository name.");
      return;
    }
    if (!REPO_NAME_PATTERN.test(name)) {
      setCreateRepoErrorMsg("Repository names can only contain letters, numbers, '.', '-' and '_'.");
      return;
    }
    setIsSubmittingNewRepo(true);
    setCreateRepoErrorMsg(null);
    try {
      const repo = await createRepository(name, newRepoIsPrivate);
      trackEvent("repo_created", { is_private: newRepoIsPrivate });
      setRepos((prev: any[]) => [repo, ...prev]);
      setSelectedRepoFullId(repo.full_name);
      resetRepoScopedState();
      setIsCreatingRepo(false);
    } catch (err: any) {
      setCreateRepoErrorMsg(err.message || "Failed to create the repository.");
    } finally {
      setIsSubmittingNewRepo(false);
    }
  };

  const handleConnect = useCallback(async () => {
    // Open the popup synchronously, on the click itself — some browsers
    // (notably Safari/iOS) only treat window.open as user-initiated if it
    // happens with no `await` in between, or it gets silently blocked with
    // no error. We open a blank popup now and point it at the real URL once
    // we have it, instead of awaiting the fetch first and opening after.
    const authWindow = window.open("", "oauth_popup", "width=600,height=700");
    if (!authWindow) {
      setErrorMsg("Please allow popups to connect your GitHub account.");
      return;
    }
    try {
      trackEvent("connect_github_initiated");
      setErrorMsg(null);
      // The OAuth `state` value is now generated and validated entirely
      // server-side (bound to a signed, HttpOnly cookie) — see /api/auth/url
      // and /auth/callback in server.ts. The client no longer needs to mint
      // or track its own state value.
      const response = await fetch("/api/auth/url");
      if (!response.ok) throw new Error("Failed to get auth URL");

      const { url } = await response.json();
      authWindow.location.href = url;
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to start OAuth flow.");
      authWindow.close();
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.error(err);
    }
    setUser(null);
    setRepos([]);
    setSelectedSource(null);
    setExtractedFiles([]);
    setUploadSuccessUrl(null);
    setIsCreatingRepo(false);
  }, []);

  const processFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/zip" && !file.name.endsWith(".zip")) {
      setErrorMsg("Please select a valid ZIP file.");
      return;
    }
    setErrorMsg(null);
    setSelectedSource({ kind: "zip", name: file.name });
    setUploadSuccessUrl(null);
    trackEvent("zip_uploaded", { size_bytes: file.size, file_name: file.name });

    setIsExtracting(true);
    try {
      const files = await extractZip(file, (fname) => setExtractingName(fname));
      setExtractedFiles(files);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Failed to extract ZIP.");
      setExtractedFiles([]);
      setSelectedSource(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const processFolder = async (files: File[], folderName: string) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setSelectedSource({ kind: "folder", name: folderName });
    setUploadSuccessUrl(null);
    trackEvent("folder_uploaded", { file_count: files.length, folder_name: folderName });

    setIsExtracting(true);
    try {
      const extracted = await extractFolder(files, (fname) => setExtractingName(fname));
      setExtractedFiles(extracted);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Failed to read the selected folder.");
      setExtractedFiles([]);
      setSelectedSource(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // Reset input to allow selecting the same file again
    await processFile(file);
  };

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files = fileList ? Array.from(fileList) : [];
    e.target.value = ''; // Reset input to allow selecting the same folder again
    if (files.length === 0) return;
    // webkitRelativePath looks like "my-project/src/App.tsx" — take the
    // first segment as the folder's display name.
    const folderName = ((files[0] as any).webkitRelativePath || files[0].name).split("/")[0];
    await processFolder(files, folderName);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Only clear once the pointer actually leaves the drop zone, not when it
    // crosses into a child element (which also fires dragleave on the parent).
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);

    // A dropped folder arrives as a single DataTransferItem whose entry is a
    // directory — detect that first and walk it recursively. Otherwise fall
    // back to the plain file (ZIP) path, same as before.
    const item = e.dataTransfer.items?.[0];
    const entry = item?.kind === "file" ? item.webkitGetAsEntry?.() : null;
    if (entry && entry.isDirectory) {
      const files = await filesFromDataTransferItems(e.dataTransfer.items);
      await processFolder(files, entry.name);
      return;
    }

    const file = e.dataTransfer.files?.[0];
    await processFile(file);
  };

  const handleUpload = async () => {
    if (!user || !selectedRepoFullId || extractedFiles.length === 0) return;
    
    // If it was already successful, open the link instead
    if (uploadSuccessUrl) {
      window.open(uploadSuccessUrl, "_blank");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setSecretWarningMsg(null);
    const [owner, repo] = selectedRepoFullId.split("/");

    // Scan for and strip out secrets (API keys, tokens, .env files, private keys, etc.)
    // before pushing, so a leaked credential in the ZIP doesn't cause GitHub's push
    // protection to reject the upload.
    // sanitizeFiles is async and yields back to the event loop periodically
    // (like extractZip), so the spinner set above actually gets a chance to
    // paint before this potentially heavy scan/redaction work runs.
    const { sanitized: filesToUpload, report } = await sanitizeFiles(extractedFiles);
    if (report.skippedFiles.length > 0 || report.redactedFiles.length > 0) {
      const parts: string[] = [];
      if (report.skippedFiles.length > 0) {
        parts.push(`${report.skippedFiles.length} sensitive file(s) excluded (${report.skippedFiles.join(", ")})`);
      }
      if (report.redactedFiles.length > 0) {
        parts.push(`${report.redactedFiles.length} file(s) had secrets redacted before pushing`);
      }
      setSecretWarningMsg(parts.join(" · "));
      trackEvent("secrets_sanitized", {
        skipped_count: report.skippedFiles.length,
        redacted_count: report.redactedFiles.length,
      });
    }

    try {
      await uploadToGitHub(
        owner,
        repo,
        filesToUpload,
        "Upload files via ZiptoGit",
        (status, current, total) => {
          setUploadStatusMsg(status);
          setUploadProgress({ current, total });
        }
      );
      setUploadSuccessUrl(`https://github.com/${selectedRepoFullId}`);
      trackEvent("push_successful", { files_count: extractedFiles.length });
    } catch (err: any) {
      console.error("Upload error details:", err);
      const apiErrorMsg = err.response?.data?.message;
      setErrorMsg(apiErrorMsg ? `GitHub API Error: ${apiErrorMsg}` : (err.message || "An error occurred during upload."));
      trackEvent("push_failed", { error: apiErrorMsg || err.message });
    } finally {
      setIsUploading(false);
    }
  };

  // --- Manage (delete) existing repo files/folders --- //
  const toggleFileManager = async () => {
    const next = !showFileManager;
    setShowFileManager(next);
    setDeleteSuccessMsg(null);
    setTreeErrorMsg(null);
    setShowDeleteRepoConfirm(false);
    setDeleteRepoConfirmText("");
    setDeleteRepoErrorMsg(null);
    if (next && selectedRepoFullId) {
      setIsLoadingTree(true);
      setSelectedDeletePaths(new Set());
      try {
        const [owner, repo] = selectedRepoFullId.split("/");
        const { tree } = await fetchRepoTree(owner, repo);
        setRepoTree(tree);
      } catch (err: any) {
        console.error(err);
        setTreeErrorMsg(err.message || "Failed to load repository files.");
        setRepoTree([]);
      } finally {
        setIsLoadingTree(false);
      }
    }
  };

  const toggleDeleteSelection = (path: string) => {
    setSelectedDeletePaths((prev: Set<string>) => toggleSelection(prev, path));
  };

  const handleDeleteSelected = async () => {
    if (!user || !selectedRepoFullId || selectedDeletePaths.size === 0) return;
    const [owner, repo] = selectedRepoFullId.split("/");
    const pathsArray: string[] = Array.from(selectedDeletePaths);

    setIsDeleting(true);
    setTreeErrorMsg(null);
    setDeleteSuccessMsg(null);
    try {
      await deleteRepoPaths(
        owner,
        repo,
        pathsArray,
        `Delete ${pathsArray.length} item(s) via ZiptoGit`,
        (status) => setDeleteStatusMsg(status)
      );
      setDeleteSuccessMsg(`Deleted ${pathsArray.length} item(s) successfully.`);
      trackEvent("repo_files_deleted", { count: pathsArray.length });
      // Refresh the tree so the UI reflects the new state.
      const { tree } = await fetchRepoTree(owner, repo);
      setRepoTree(tree);
      setSelectedDeletePaths(new Set());
    } catch (err: any) {
      console.error("Delete error details:", err);
      setTreeErrorMsg(err.message || "Failed to delete selected items.");
      trackEvent("repo_files_delete_failed", { error: err.message });
    } finally {
      setIsDeleting(false);
      setDeleteStatusMsg("");
    }
  };

  const handleDeleteRepo = async () => {
    if (!user || !selectedRepoFullId) return;
    const [owner, repo] = selectedRepoFullId.split("/");
    if (deleteRepoConfirmText !== repo) return;

    setIsDeletingRepo(true);
    setDeleteRepoErrorMsg(null);
    try {
      await deleteRepository(owner, repo);
      trackEvent("repo_deleted");
      // Remove it from local state and reset selection since it no longer exists.
      setRepos((prev: any[]) => prev.filter((r: any) => r.full_name !== selectedRepoFullId));
      setSelectedRepoFullId("");
      setShowFileManager(false);
      setShowDeleteRepoConfirm(false);
      setDeleteRepoConfirmText("");
      setRepoTree([]);
      setSelectedDeletePaths(new Set());
    } catch (err: any) {
      console.error("Delete repo error details:", err);
      setDeleteRepoErrorMsg(err.message || "Failed to delete repository.");
      trackEvent("repo_delete_failed", { error: err.message });
    } finally {
      setIsDeletingRepo(false);
    }
  };

  const repoSection = (
              <div className="mb-7">
                <div className="flex justify-between items-center mb-2.5">
                  <label className="text-[13px] font-semibold text-slate-700 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    Select Repository
                  </label>
                  <button 
                    onClick={logout} 
                    className="text-[12px] text-slate-500 hover:text-slate-600 flex items-center gap-1.5 transition-colors p-2 -mr-2"
                  >
                    <LogOut className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
                <div className="relative">
                  <select 
                    value={isCreatingRepo ? CREATE_NEW_REPO_VALUE : (selectedRepoFullId || "")}
                    onChange={(e) => handleRepoSelectChange(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none appearance-none cursor-pointer"
                    disabled={isUploading}
                  >
                    <option value="" disabled>Choose a repository...</option>
                    {repos.map(r => <option key={r.id} value={r.full_name}>{r.name}</option>)}
                    <option value={CREATE_NEW_REPO_VALUE}>+ Create New Repository</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                {isCreatingRepo && (
                  <div className="mt-3 border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                    <label className="text-[12.5px] font-medium text-slate-600 mb-1.5 block">
                      New repository name
                    </label>
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      disabled={isSubmittingNewRepo}
                      placeholder="ziptogit.in_new1"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none mb-3"
                    />

                    <div className="flex items-center gap-4 mb-3.5">
                      <button
                        type="button"
                        onClick={() => setNewRepoIsPrivate(false)}
                        disabled={isSubmittingNewRepo}
                        className={`flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                          !newRepoIsPrivate
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" /> Public
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewRepoIsPrivate(true)}
                        disabled={isSubmittingNewRepo}
                        className={`flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                          newRepoIsPrivate
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" /> Private
                      </button>
                    </div>

                    {createRepoErrorMsg && (
                      <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {createRepoErrorMsg}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCreateRepo}
                        disabled={isSubmittingNewRepo}
                        className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isSubmittingNewRepo ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" /> Create repository
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelCreateRepo}
                        disabled={isSubmittingNewRepo}
                        className="px-4 py-2.5 bg-white text-slate-500 border border-slate-200 rounded-lg text-sm font-medium transition-colors hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!isCreatingRepo && selectedRepoFullId && (
                  <button
                    type="button"
                    onClick={toggleFileManager}
                    className="mt-2.5 text-[12.5px] text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition-colors py-2 px-2 -mx-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {showFileManager ? "Hide file manager" : "Manage files & folders (delete)"}
                  </button>
                )}

                {showFileManager && (
                  <div className="mt-3 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                    {isLoadingTree ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading repository files...
                      </div>
                    ) : treeErrorMsg ? (
                      <div className="text-sm text-red-600 flex items-start gap-2 py-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {treeErrorMsg}
                      </div>
                    ) : repoTree.length === 0 ? (
                      <p className="text-sm text-slate-500 py-2 text-center">This repository has no files yet.</p>
                    ) : (
                      <>
                        <p className="text-[11.5px] font-medium text-slate-500 mb-1.5">
                          Check files or folders below to mark them for deletion
                        </p>
                        <div className="max-h-64 overflow-y-auto pr-1 mb-3">
                          <FileTreeView
                            nodes={buildTree(repoTree)}
                            selected={selectedDeletePaths}
                            onToggle={toggleDeleteSelection}
                          />
                        </div>
                        {deleteSuccessMsg && (
                          <div className="mb-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs flex items-start gap-2">
                            <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {deleteSuccessMsg}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleDeleteSelected}
                          disabled={selectedDeletePaths.size === 0 || isDeleting}
                          className="w-full py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-medium transition-colors hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" /> {deleteStatusMsg || "Deleting..."}
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4" />
                              Delete {selectedDeletePaths.size > 0 ? `${selectedDeletePaths.size} selected` : "selected"}
                            </>
                          )}
                        </button>
                      </>
                    )}

                    {/* Danger Zone: delete the entire repository */}
                    {!isLoadingTree && (
                      <div className="mt-4 pt-3 border-t border-red-100">
                        {!showDeleteRepoConfirm ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteRepoConfirm(true);
                              setDeleteRepoConfirmText("");
                              setDeleteRepoErrorMsg(null);
                            }}
                            className="text-[12.5px] text-red-600 hover:text-red-700 flex items-center gap-1.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete entire repository
                          </button>
                        ) : (
                          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                            <p className="text-xs text-red-700 font-medium mb-1">
                              This permanently deletes the whole repository — this cannot be undone.
                            </p>
                            <p className="text-xs text-red-600 mb-2">
                              Type <span className="font-mono font-semibold">{selectedRepoFullId.split("/")[1]}</span> to confirm.
                            </p>
                            <input
                              type="text"
                              value={deleteRepoConfirmText}
                              onChange={(e) => setDeleteRepoConfirmText(e.target.value)}
                              placeholder={selectedRepoFullId.split("/")[1]}
                              className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 text-sm mb-2 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none"
                              disabled={isDeletingRepo}
                            />
                            {deleteRepoErrorMsg && (
                              <div className="mb-2 text-xs text-red-700 flex items-start gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {deleteRepoErrorMsg}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDeleteRepoConfirm(false);
                                  setDeleteRepoConfirmText("");
                                  setDeleteRepoErrorMsg(null);
                                }}
                                disabled={isDeletingRepo}
                                className="flex-1 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleDeleteRepo}
                                disabled={deleteRepoConfirmText !== selectedRepoFullId.split("/")[1] || isDeletingRepo}
                                className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {isDeletingRepo ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                                ) : (
                                  "Delete forever"
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
  );

  const archiveSection = (
    <>
              <div className="mb-8">
                <label className="text-[13px] font-semibold text-slate-700 flex items-center gap-2 mb-2.5">
                  <Archive className="w-4 h-4 text-slate-400" />
                  Project Files
                </label>
                
                {!selectedSource ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()} 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                      isDraggingFile
                        ? "border-slate-400 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input 
                      type="file" 
                      accept=".zip,application/zip" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                    />
                    {/* webkitdirectory/directory are non-standard but supported by every
                        major desktop browser; there's no cross-browser standard attribute
                        name, so both are set for maximum compatibility. */}
                    <input
                      type="file"
                      className="hidden"
                      ref={folderInputRef}
                      onChange={handleFolderChange}
                      // @ts-ignore - non-standard but widely supported attributes
                      webkitdirectory=""
                      directory=""
                      multiple
                    />
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3 text-slate-400">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-slate-900 text-[14.5px] font-semibold mb-1">Click to upload or drag and drop</p>
                    <p className="text-slate-500 text-[13px] mb-3">ZIP archive or project folder, up to 50MB</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        folderInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      Or select a folder from your device
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        {isExtracting ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : selectedSource.kind === "folder" ? (
                          <Folder className="w-5 h-5" />
                        ) : (
                          <FileArchive className="w-5 h-5" />
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-medium text-slate-900 truncate">{selectedSource.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {isExtracting ? "Extracting..." : `${extractedFiles.length} files parsed`}
                        </p>
                      </div>
                    </div>
                    {!isUploading && !isExtracting && (
                      <button 
                        onClick={() => {
                          setSelectedSource(null);
                          setUploadSuccessUrl(null);
                        }}
                        aria-label="Remove selected file"
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                
                {secretWarningMsg && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm w-full flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{secretWarningMsg}</span>
                  </div>
                )}

                {errorMsg && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm w-full flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>

              {/* Action Button */}
              {uploadSuccessUrl ? (
                <button 
                  onClick={handleUpload}
                  className="w-full py-3.5 bg-[#111827] text-white rounded-xl font-medium text-[15px] transition-colors hover:bg-[#1a2333] flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  View on GitHub
                </button>
              ) : (
                <button 
                  onClick={handleUpload}
                  disabled={isUploading || isExtracting || !selectedSource || !selectedRepoFullId || isCreatingRepo}
                  className="w-full py-3.5 bg-[#111827] text-white rounded-xl font-medium text-[15px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1a2333] flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> 
                      {uploadStatusMsg || "Uploading..."}
                    </>
                  ) : (
                    "Push to GitHub"
                  )}
                </button>
              )}
    </>
  );

  return (
    <>
    <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden lg:hidden">
        
        {/* Header Section */}
        <div className="bg-[#111827] px-8 py-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mb-5">
            <Github className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-[22px] font-semibold tracking-tight text-white mb-2">ZiptoGit</h2>
          <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[280px]">
            Upload your AI Studio ZIP exports and push them directly to your repositories.
          </p>
        </div>

        {/* Content Section */}
        <div className="p-8 bg-white">
          {isCheckingAuth ? (
            <div className="flex flex-col items-center py-10">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : !user ? (
            <div className="flex flex-col items-center">
              <p className="text-slate-500 text-[13.5px] leading-relaxed text-center mb-8 px-2">
                Connect your GitHub account to securely push zip contents directly to your repositories without needing a local Git environment.
              </p>
              <button 
                onClick={handleConnect} 
                className="w-full bg-[#111827] text-white py-3.5 rounded-xl font-medium focus:ring-4 focus:ring-slate-100 transition-all flex justify-center items-center gap-2 hover:bg-[#1a2333]"
              >
                <Github className="w-5 h-5" />
                Connect GitHub
              </button>
              {errorMsg && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm w-full flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 animate-in fade-in duration-300">
              
              {repoSection}

              {archiveSection}

              
            </div>
          )}
        </div>
      </div>
    {/* Desktop dashboard -- lg+ only. Mobile card above is completely untouched. */}
    <div className="hidden lg:flex w-full max-w-[860px] bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100">
      {isCheckingAuth ? (
        <div className="flex-1 flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : !user ? (
        <div className="flex-1 flex flex-col items-center justify-center px-16 py-20 text-center">
          <div className="w-14 h-14 bg-[#111827] rounded-2xl flex items-center justify-center mb-6">
            <Github className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#0B1120] mb-2">Connect your GitHub account</h2>
          <p className="text-slate-500 text-[14px] leading-relaxed max-w-[360px] mb-8">
            Securely push zip contents directly to your repositories without needing a local Git environment.
          </p>
          <button
            onClick={handleConnect}
            className="bg-[#111827] text-white py-3.5 px-8 rounded-xl font-medium focus:ring-4 focus:ring-slate-100 transition-all flex justify-center items-center gap-2 hover:bg-[#1a2333]"
          >
            <Github className="w-5 h-5" />
            Connect GitHub
          </button>
          {errorMsg && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm max-w-[360px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Feature sidebar */}
          <div className="w-[220px] shrink-0 bg-slate-50/60 border-r border-slate-100 p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2.5 mb-6 px-1">
              <div className="w-7 h-7 bg-[#0B1120] rounded-lg flex items-center justify-center shrink-0">
                <Github className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold tracking-tight text-[14px] text-[#0B1120] truncate">{user.login}</span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2.5 text-[13px] font-medium text-slate-700 rounded-lg px-3 py-2.5 hover:bg-white hover:shadow-sm transition-all text-left"
            >
              <Upload className="w-4 h-4 text-slate-400" /> Push a ZIP
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-2.5 text-[13px] font-medium text-slate-700 rounded-lg px-3 py-2.5 hover:bg-white hover:shadow-sm transition-all text-left"
            >
              <Folder className="w-4 h-4 text-slate-400" /> Push a folder
            </button>
            <button
              type="button"
              onClick={() => handleRepoSelectChange(CREATE_NEW_REPO_VALUE)}
              className="flex items-center gap-2.5 text-[13px] font-medium text-slate-700 rounded-lg px-3 py-2.5 hover:bg-white hover:shadow-sm transition-all text-left"
            >
              <Plus className="w-4 h-4 text-slate-400" /> New repository
            </button>
            <button
              type="button"
              onClick={toggleFileManager}
              disabled={!selectedRepoFullId}
              className="flex items-center gap-2.5 text-[13px] font-medium text-slate-700 rounded-lg px-3 py-2.5 hover:bg-white hover:shadow-sm transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4 text-slate-400" /> Manage files
            </button>

            <div className="flex items-center gap-2.5 text-[13px] font-medium text-slate-500 rounded-lg px-3 py-2.5 mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Secret scanning on
            </div>

            <div className="flex-1" />

            {selectedRepoFullId && (
              <button
                type="button"
                onClick={() => {
                  if (!showFileManager) { toggleFileManager(); }
                  setShowDeleteRepoConfirm(true);
                }}
                className="flex items-center gap-2.5 text-[13px] font-medium text-red-600 rounded-lg px-3 py-2.5 hover:bg-red-50 transition-all text-left"
              >
                <Trash2 className="w-4 h-4" /> Danger zone
              </button>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2.5 text-[12.5px] text-slate-500 hover:text-slate-700 rounded-lg px-3 py-2.5 transition-colors text-left"
            >
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>

          {/* Main workflow panel */}
          <div className="flex-1 min-w-0 p-7">
            {repoSection}

            {archiveSection}
          </div>
        </>
      )}
    </div>

    </>

  );
}

// --- Content Pages --- //
// Bump this whenever the Privacy Policy copy below actually changes — it must
// never be computed at render time (was `new Date().toLocaleDateString()`,
// which falsely told every visitor the policy was updated that same day).
const PRIVACY_LAST_UPDATED = "August 10, 2026";

function PrivacyPage() {
  return (
    <PageLayout title="Privacy Policy">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8 sm:p-12 text-slate-700">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
        <p className="mb-4">Last Updated: {PRIVACY_LAST_UPDATED}</p>
        <h2 className="text-xl font-semibold text-slate-900 mt-6 mb-3">1. Information We Collect</h2>
        <p className="mb-4">ZiptoGit requests OAuth access to your GitHub account to push files directly to your repositories. We do not store your repository contents or your source code on our servers.</p>
        <h2 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2. How We Use Information</h2>
        <p className="mb-4">Your GitHub access token is never stored in your browser. It is held only in a secure, HttpOnly server-side session used to interface with the GitHub API on your behalf to perform ZIP extraction and commit operations.</p>
        <h2 className="text-xl font-semibold text-slate-900 mt-6 mb-3">3. Third-Party Services</h2>
        <p className="mb-4">We use Google Analytics to monitor usage and improve the tool. We do not sell your data.</p>
      </div>
    </PageLayout>
  );
}

function TermsPage() {
  return (
    <PageLayout title="Terms of Service">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8 sm:p-12 text-slate-700">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Terms of Service</h1>
        <p className="mb-4">Welcome to ZiptoGit by Dipesh Nalawade!</p>
        <h2 className="text-xl font-semibold text-slate-900 mt-6 mb-3">1. Acceptance of Terms</h2>
        <p className="mb-4">By accessing or using our service, you agree to these Terms. If you do not agree, do not use the service.</p>
        <h2 className="text-xl font-semibold text-slate-900 mt-6 mb-3">2. Responsible Use</h2>
        <p className="mb-4">You are responsible for what you upload to your connected GitHub repositories. We are not liable for any code overrides, data loss, or unintended repository modifications.</p>
        <h2 className="text-xl font-semibold text-slate-900 mt-6 mb-3">3. Disclaimer of Warranties</h2>
        <p className="mb-4">ZiptoGit is provided "as is" without warranty of any kind. Use at your own risk.</p>
      </div>
    </PageLayout>
  );
}

function ContactPage() {
  return (
    <PageLayout title="Contact Us">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-md p-8 sm:p-12 text-center text-slate-700">
        <div className="w-12 h-12 bg-[#0B1120] rounded-xl flex items-center justify-center mx-auto mb-6">
          <Github className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Contact</h1>
        <p className="mb-8">Have a question, feedback, or need support? Reach out directly.</p>

        <div className="inline-flex flex-col items-center gap-2 p-6 bg-slate-50 rounded-xl border border-slate-200">
          <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Support Email</span>
          <a href="mailto:siteget1234@gmail.com" className="text-lg font-medium text-[#111827] hover:underline">siteget1234@gmail.com</a>
        </div>
      </div>
    </PageLayout>
  );
}

function HowItWorksPage() {
  return (
    <PageLayout title="How It Works">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8 sm:p-12 text-slate-700">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">How It Works</h1>
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold shrink-0">1</div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Connect GitHub</h3>
              <p>Sign in with your GitHub account. Your access token is kept in a secure server-side session — never in your browser's storage.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold shrink-0">2</div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Upload ZIP</h3>
              <p>Drag and drop your AI Studio ZIP export. The files are unzipped and scanned for secrets right in your browser before anything leaves your device.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[#111827] text-white flex items-center justify-center font-bold shrink-0">3</div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Sync Directly</h3>
              <p>We push the extracted files directly back into your selected repository using the GitHub API in one clean commit.</p>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function FAQPage() {
  const faqs = [
    { q: "Is my code secure?", a: "Yes. Your ZIP is extracted and scanned for secrets right in your browser. The push to GitHub is then proxied through our server using a secure, HttpOnly session — your GitHub access token is never sent to or stored in your browser." },
    { q: "What does ZiptoGit cost?", a: "It is currently completely free to use." },
    { q: "Can I use it for private repositories?", a: "Yes. When you authenticate via OAuth, you grant the app access to read and commit to repositories you have permissions for." }
  ];

  return (
    <PageLayout title="FAQ">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8 sm:p-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-8 text-center">Frequently Asked Questions</h1>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="p-5 border border-slate-200 rounded-xl bg-slate-50">
              <h3 className="font-semibold text-slate-900 mb-2">{faq.q}</h3>
              <p className="text-slate-600 text-[14.5px] leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

// --- Main App / Router --- //
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeLayout />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/contact" element={<ContactPage />} />
      </Routes>
    </BrowserRouter>
  );
}
