const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const projectRoot = path.resolve(__dirname, "..");

const pkg = (() => {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(path.join(projectRoot, "package.json"));
  } catch {
    return {};
  }
})();

const normalizeEnvValue = (value) => String(value ?? "").trim();

const firstEnv = (keys) => {
  for (const key of keys) {
    const value = normalizeEnvValue(process.env[key]);
    if (value) {
      return value;
    }
  }
  return null;
};

const readTextFile = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
};

const findGitEntry = (startDir) => {
  let current = startDir;
  for (let idx = 0; idx < 8; idx += 1) {
    const candidate = path.join(current, ".git");
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
    const parent = path.dirname(current);
    if (!parent || parent === current) {
      break;
    }
    current = parent;
  }
  return null;
};

const resolveGitDir = (gitEntry) => {
  if (!gitEntry) return null;
  try {
    const stat = fs.statSync(gitEntry);
    if (stat.isDirectory()) {
      return gitEntry;
    }
  } catch {
    return null;
  }

  const content = readTextFile(gitEntry);
  if (!content) return null;
  const match = content.trim().match(/^gitdir:\s*(.+)\s*$/i);
  if (!match) return null;
  const gitDirRaw = match[1].trim();
  if (!gitDirRaw) return null;
  return path.resolve(path.dirname(gitEntry), gitDirRaw);
};

const parsePackedRef = (packedRefsContent, ref) => {
  if (!packedRefsContent || !ref) return null;
  const lines = packedRefsContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("^")) {
      continue;
    }
    const [sha, name] = trimmed.split(" ");
    if (name === ref && sha && /^[0-9a-f]{7,40}$/i.test(sha)) {
      return sha;
    }
  }
  return null;
};

const readGitShaFromDir = (gitDir) => {
  if (!gitDir) return null;
  const headContent = readTextFile(path.join(gitDir, "HEAD"));
  if (!headContent) return null;

  const trimmed = headContent.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith("ref:")) {
    return /^[0-9a-f]{7,40}$/i.test(trimmed) ? trimmed : null;
  }

  const refPath = trimmed.replace(/^ref:\s*/i, "").trim();
  if (!refPath) return null;
  const refContent = readTextFile(path.join(gitDir, refPath));
  const refSha = refContent ? refContent.trim() : null;
  if (refSha && /^[0-9a-f]{7,40}$/i.test(refSha)) {
    return refSha;
  }

  const packedRefs = readTextFile(path.join(gitDir, "packed-refs"));
  return parsePackedRef(packedRefs, refPath);
};

const readGitRefFromDir = (gitDir) => {
  if (!gitDir) return null;
  const headContent = readTextFile(path.join(gitDir, "HEAD"));
  if (!headContent) return null;
  const trimmed = headContent.trim();
  if (!trimmed.startsWith("ref:")) return null;
  const refPath = trimmed.replace(/^ref:\s*/i, "").trim();
  if (!refPath) return null;
  const parts = refPath.split("/");
  return parts.length ? parts[parts.length - 1] : null;
};

const getGitInfo = () => {
  const envSha = firstEnv([
    "GIT_SHA",
    "COMMIT_SHA",
    "SOURCE_VERSION",
    "HEROKU_SLUG_COMMIT",
    "RENDER_GIT_COMMIT",
    "VERCEL_GIT_COMMIT_SHA",
    "NETLIFY_COMMIT_REF",
    "COMMIT_REF",
    "GITHUB_SHA",
    "RAILWAY_GIT_COMMIT_SHA",
  ]);

  const envRef = firstEnv([
    "GIT_REF",
    "GIT_BRANCH",
    "BRANCH",
    "RENDER_GIT_BRANCH",
    "VERCEL_GIT_COMMIT_REF",
    "GITHUB_REF_NAME",
    "NETLIFY_BRANCH",
  ]);

  const gitEntry = findGitEntry(projectRoot);
  const gitDir = resolveGitDir(gitEntry);
  const fsSha = readGitShaFromDir(gitDir);
  const fsRef = readGitRefFromDir(gitDir);

  const cmdSha = (() => {
    try {
      const stdout = childProcess.execSync("git rev-parse HEAD", {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const value = stdout ? String(stdout).trim() : "";
      return value && /^[0-9a-f]{7,40}$/i.test(value) ? value : null;
    } catch {
      return null;
    }
  })();

  const sha = envSha || fsSha || cmdSha || null;
  const ref = envRef || fsRef || null;
  return { sha, ref };
};

const writeBuildMeta = () => {
  const { sha, ref } = getGitInfo();
  const build = {
    service: "tradingapp-web",
    version: pkg?.version || null,
    gitSha: sha,
    gitRef: ref,
    builtAt: new Date().toISOString(),
  };

  const outPath = path.join(projectRoot, "public", "build-meta.json");
  fs.writeFileSync(outPath, `${JSON.stringify(build, null, 2)}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[build-meta] Wrote ${path.relative(projectRoot, outPath)}`);
};

writeBuildMeta();
