# claude-gateway App Store — Registry

The central **catalog** of the getpod App Store. This repo holds a single source
of truth, [`apps.json`](./apps.json), plus each app's icon and screenshots. The
getpod web UI reads this catalog to list installable apps, and the
[claude-gateway](https://github.com/0xMaxMa/claude-gateway) installs an app by
cloning its repo at the pinned commit.

- **Catalog:** [`apps.json`](./apps.json)
- **Schema:** [`schema/apps.schema.json`](./schema/apps.schema.json) (JSON Schema draft-07)
- **Images:** `apps/<name>/icon.png` and `apps/<name>/screenshots/*.png`
- **CI:** every PR is validated by [`.github/workflows/validate.yml`](./.github/workflows/validate.yml)

---

## Two ways to submit an app

### 1. Through getpod (recommended)

In the getpod web app, open **Apps → Publish**, point it at your public GitHub
repo, fill in the metadata, and upload an icon/screenshots. An admin reviews the
submission; on approval getpod opens an **auto-PR** against this repo. You don't
edit any files here by hand.

### 2. Manual PR (for maintainers)

1. Add or update your entry in `apps.json` (see [Schema](#schema) below).
2. Place the icon at `apps/<name>/icon.png` and any screenshots under
   `apps/<name>/screenshots/`.
3. Run the validator locally (see [Validation](#validation)) until it's green.
4. Open a PR. CI must pass before an admin merges.

> **Versions are append-only.** When you publish a new version, **add** it to the
> end of that app's `versions[]` array — do not remove older entries. The gateway
> selects the newest by `approved_at`.

---

## Schema

`apps.json` has a top-level object with `updated_at`, `categories[]`, and `apps[]`.
Full contract: [`schema/apps.schema.json`](./schema/apps.schema.json).

```json
{
  "updated_at": "2026-08-04T00:00:00Z",
  "categories": ["Productivity", "Developer Tools", "AI & Agents", "Data",
                 "Communication", "Utilities", "Finance", "Entertainment"],
  "apps": [
    {
      "name": "getpod-manager",
      "description": "VM resize, SSH keys, and usage metrics",
      "tagline": "Manage your pod from inside your pod",
      "repo": "https://github.com/0xMaxMa/app-getpod-manager",
      "author": "0xMaxMa",
      "category": "Developer Tools",
      "icon": "apps/getpod-manager/icon.png",
      "screenshots": ["apps/getpod-manager/screenshots/01.png"],
      "versions": [
        { "version": "1.0.3", "commit": "7a706018f167f088f71fe22a418a8d0a0c25538d", "approved_at": "2026-06-02" }
      ]
    }
  ]
}
```

### Fields

| Field | Level | Required | Notes |
|-------|-------|----------|-------|
| `updated_at` | top | ✅ | ISO-8601 timestamp of the last catalog change |
| `categories` | top | ✅ | Allowed category list — the single source of truth |
| `name` | app | ✅ | Globally unique slug, `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`. Also the image folder name |
| `description` | app | ✅ | Short description |
| `repo` | app | ✅ | Public GitHub repo URL (`https://github.com/...`) |
| `author` | app | ✅ | GitHub handle of the owner |
| `category` | app | ✅ | Must be one of `categories[]` |
| `icon` | app | ✅ | `apps/<name>/icon.(png\|webp)` |
| `tagline` | app | optional | One line, ≤ 80 chars, shown under the name |
| `screenshots` | app | optional | 0–6 paths under `apps/<name>/screenshots/` |
| `version` | version | ✅ | Semantic version (`MAJOR.MINOR.PATCH`) |
| `commit` | version | ✅ | Full 40-char git commit hash |
| `approved_at` | version | ✅ | Approval date, `YYYY-MM-DD` |

> **Backward compatibility:** the gateway registry parser only reads
> `name`, `description`, `repo`, `versions[]` (with `version` + 40-hex `commit`).
> The extra fields above are additive and ignored by the gateway — existing
> installs keep working.

---

## Image specs

```
apps/
  <name>/
    icon.png            # required — square, 512×512 recommended (min 128×128), ≤ 512 KB
    screenshots/
      01.png            # optional — 16:10 or 16:9, ≤ 1 MB each, ≤ 6 images
      02.png
```

- Format: **PNG or WebP** only (verified by magic bytes in CI).
- The folder name must equal the app's `name`.

---

## Categories

| Category | For |
|----------|-----|
| **Productivity** | Task, docs, and workflow tools |
| **Developer Tools** | Dev/ops utilities, dashboards, tooling |
| **AI & Agents** | LLM-powered apps and autonomous agents |
| **Data** | Databases, analytics, dashboards |
| **Communication** | Chat, email, notifications |
| **Utilities** | Small general-purpose helpers |
| **Finance** | Budgeting, invoicing, payments |
| **Entertainment** | Media, games, fun |

To add a category, edit the top-level `categories[]` array.

---

## Validation

CI (`validate.yml`) runs on every PR and push to `main`. Run the same checks
locally:

```bash
npm install
npm run validate
```

It verifies:

**Structure (JSON Schema, via `ajv`):**
- `apps.json` parses and matches the schema
- `name` matches the slug regex; `category`, `icon` present
- `version` is semver; `commit` is 40-char hex; `approved_at` is a date

**Cross-field / files (custom script):**
- `name` is unique across the file; no duplicate versions per app
- `category` is a member of top-level `categories[]`
- every `icon` / `screenshots[]` path exists and is a real PNG/WebP within size limits
- unreferenced images under `apps/*/` are reported as warnings

---

## Review policy

An admin approves a submission when:

- the app repo is **public** and its `app.yaml` is valid
- no secrets are hardcoded in the repo
- the icon/screenshots meet the specs above
- CI on the PR is green
- `commit` points to a real commit in the app's repo
