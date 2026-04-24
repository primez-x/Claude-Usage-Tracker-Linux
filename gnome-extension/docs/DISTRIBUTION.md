# Distributing Claude Usage Tracker for GNOME

GNOME Shell extensions are **not** Flatpaks. They are JavaScript modules that run inside the GNOME Shell process. This means they cannot be sandboxed or distributed via Flathub.

Instead, GNOME extensions use these distribution channels:

| Channel | User Experience | Effort |
|---------|----------------|--------|
| **extensions.gnome.org (EGO)** | One-click install from Extension Manager | Medium (review required) |
| **GitHub Releases** | Download `.zip` → Install from File in Extension Manager | Low |
| **Local build** | `make install` | Developer-only |

---

## Method 1: extensions.gnome.org (Recommended)

This is the standard way GNOME users discover and install extensions. Once published, your extension appears in **Extension Manager** automatically.

### Step 1: Prepare a clean release zip

EGO expects a minimal zip without dev/build files:

```bash
cd gnome-extension
make release
# Creates: claude-usage-tracker@hamed-elfayome.github.io.ego.zip
```

### Step 2: Create an EGO account

1. Go to https://extensions.gnome.org
2. Click "Login" (uses GNOME GitLab OAuth)
3. Authorize the application

### Step 3: Submit the extension

1. Go to https://extensions.gnome.org/upload/
2. Upload the `*.ego.zip` file
3. Fill in the form:
   - **Name**: Claude Usage Tracker
   - **Description**: Real-time Claude AI usage monitoring in your GNOME panel. Track session, weekly, Opus, and Sonnet usage with multi-profile support.
   - **URL**: `https://github.com/hamed-elfayome/Claude-Usage-Tracker`
   - **Current version**: `1`
   - **Shell version**: `50`
4. Upload at least 1 screenshot (PNG/JPG, max 1MB, 16:9 or 4:3 ratio)
5. Submit for review

### Step 4: Review process

- A human reviewer checks your extension (usually 1–7 days)
- Common rejection reasons:
  - Using `setTimeout` instead of `GLib.timeout_add`
  - Not cleaning up on `disable()`
  - Blocking the main thread with sync I/O
  - Using deprecated APIs
  - Missing `gettext-domain` in metadata
- If rejected, fix the issues and re-upload

### Step 5: Publish updates

When you release a new version:
1. Bump the `version` field in `metadata.json`
2. Run `make release`
3. Upload the new zip to EGO
4. The update rolls out automatically to all users

---

## Method 2: GitHub Releases

This is faster than EGO (no review) but users must install manually.

### One-time setup

1. Go to your GitHub repo → Settings → Actions → General
2. Ensure "Workflow permissions" is set to "Read and write contents"

### Automated releases via GitHub Actions

The CI workflow (`.github/workflows/gnome-extension.yml`) already builds the zip on every push to `main`. You can extend it to auto-publish releases:

```yaml
      - name: Upload Release Asset
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: gnome-extension/*.zip
```

### Manual release process

```bash
# 1. Tag a release
git tag -a gnome-v1.0.0 -m "GNOME extension v1.0.0"
git push origin gnome-v1.0.0

# 2. Build the release artifact
cd gnome-extension
make release

# 3. Go to GitHub → Releases → Draft a new release
# 4. Attach claude-usage-tracker@hamed-elfayome.github.io.ego.zip
# 5. Publish
```

### User install from GitHub Release

1. Download the `.zip` from the Release page
2. Open **Extension Manager** (install from Flathub if needed)
3. Click "+" (Install from File)
4. Select the downloaded `.zip`
5. Done

---

## Method 3: Local Install (Developer/Tester)

For testing or development:

```bash
cd gnome-extension
make install
# Then restart GNOME Shell (Alt+F2 → r on X11, or log out/in on Wayland)
gnome-extensions enable claude-usage-tracker@hamed-elfayome.github.io
```

To uninstall:
```bash
cd gnome-extension
make uninstall
```

---

## Which method should you choose?

| Scenario | Recommended channel |
|----------|---------------------|
| Official public release | **EGO** (extensions.gnome.org) |
| Beta testing with early adopters | **GitHub Releases** |
| Personal use or CI testing | **Local `make install`** |
| Enterprise/internal deployment | **GitHub Releases + custom script** |

---

## About Extension Manager

Extension Manager is a **separate desktop app** (available on Flathub) that lets users browse, install, and configure GNOME extensions:

```bash
flatpak install flathub com.mattjakeman.ExtensionManager
```

It reads from the EGO API, so once your extension is on EGO, it automatically appears in Extension Manager's search.

**Note**: Extension Manager is the *client*, not the distribution channel. You don't upload your extension *to* Extension Manager — you upload to EGO, and Extension Manager discovers it from there.
