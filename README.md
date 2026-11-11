# sveltekit-starter

Starter page templates using the [ONS svelte-components library](https://github.com/ONSvisual/svelte-components/).

A preview of these templates can be [found here](https://onsvisual.github.io/sveltekit-starter/).

## Using these templates

Create a fork or local copy of this repository ([ZIP download](https://github.com/ONSvisual/sveltekit-starter/archive/refs/heads/main.zip)), and then run the following command to install dependencies:

```bash
npm install
```

With dependencies installed, you should be able to preview the templates locally at [localhost:5173](http://localhost:5173) using the following command:

```bash
npm run dev
```

You will find the code for the starter templates within the /src/routes/ folder. You will probably want to take the **+page.svelte** file for the relevant template folder, overwrite the **/src/routes/+pages.svelte** file, and then delete the templates that you don't intend to use.

To do more with the ONS svelte-components library, you will probably want to refer to the [Storybook pages](https://onsvisual.github.io/svelte-components/).

## Building the app

When you're ready to publish the app (either for preview or for production), you'll need to run the **build** or **build:preview** command. This will build a static version of the app in the **/build** folder, the contents of which can be copied to wherever you want to host the app:

```bash
npm run build
```

Before building the app, you'll need to customise the base paths in the **/src/app.config.js** file. The default path is **/sveltekit-starter**. You can set a separate base-relative path for a preview server (eg. **/my-app**) and for a production server (eg. **/visualisations/my-app**):

```javascript
export const base_prod = '/visualisations/sveltekit-starter'; // Directory on the ONS website
export const base_preview = '/sveltekit-starter'; // Directory on datavisweb preview server or Github Pages
```

To build the preview version of the app, which uses the alternate **base_preview** path, you'll need to run this command:

```bash
npm run build:preview
```

## Automatic GitHub Pages deployment

The [Pages workflow](.github/workflows/pages.yml) runs on every push to `main` and can also be started manually from the Actions tab. Changes on other branches are published after they are merged into `main`.

### One-time repository setup

1. Open **Settings > Pages > Build and deployment**.
2. Set **Source** to **GitHub Actions**.
3. Ensure organisation policies allow the workflow's Actions and GitHub Pages deployment. If the `github-pages` environment has deployment branch restrictions, allow `main`.
4. Commit and push the workflow and configuration changes to `main`, or run **Deploy catalogue to GitHub Pages** manually after the workflow is on `main`.

The standard project-site address is https://onsdigital.github.io/visualjournalism-catalogue/. The successful deployment also reports the configured site URL in GitHub Actions. A custom domain may change this address.

### Build and deployment

The workflow installs the committed lockfile with `npm ci`, runs the date/release/taxonomy tests, and uploads the generated `build/` directory. Deployment only runs after a successful build. It uses GitHub's built-in authentication; no personal access token or separate publishing branch is required. Generated files do not need to be committed.

The Pages build sets `PUBLIC_APP_ENV=pages` to keep the homepage prerendered and takes `PUBLIC_BASE_PATH` from GitHub Pages configuration. For the standard project site this is `/visualjournalism-catalogue`. The optional override in `svelte.config.js` leaves existing local, production and preview defaults unchanged when unset.

To check the same build locally in PowerShell:

```powershell
$env:PUBLIC_APP_ENV = 'pages'
$env:PUBLIC_BASE_PATH = '/visualjournalism-catalogue'
npm run build
Remove-Item Env:PUBLIC_APP_ENV
Remove-Item Env:PUBLIC_BASE_PATH
```

After the first deployment, check JavaScript/CSS loading, filtered URLs and refreshes, browser Back/Forward, and the title and Clear all filters links under the repository subdirectory. Query-string filtering uses the same static homepage and does not require an SPA fallback. Release data is fetched at runtime, so dataset updates do not require redeployment.

## Additional templates

The following semi-automated journalism (AKA "robo-journalism") templates are also available:

- [robo-article](https://github.com/ONSvisual/robo-article)
- [robo-embed](https://github.com/ONSvisual/robo-embed)
