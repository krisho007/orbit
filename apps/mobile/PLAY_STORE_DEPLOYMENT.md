# Google Play Store Deployment Guide

This guide covers the complete process for deploying the Orbit Android app to the Google Play Store.

## Prerequisites

- Node.js 20+
- EAS CLI installed (`npm install -g eas-cli`)
- Expo account (free at [expo.dev](https://expo.dev))
- Google Play Developer account ($25 one-time fee)

## Step 1: EAS Setup

### 1.1 Login to Expo

```bash
eas login
```

### 1.2 Initialize EAS Project

Run from this directory (`apps/mobile`):

```bash
eas init
```

This will:
- Link your project to your Expo account
- Generate a unique `projectId`
- Update `app.json` with your account details

### 1.3 Update app.json

After running `eas init`, update `app.json`:

1. Replace `YOUR_EXPO_USERNAME` with your actual Expo username
2. Replace `YOUR_PROJECT_ID` with the generated project ID

## Step 2: Android Signing Credentials

### Option A: Let EAS Manage (Recommended)

```bash
eas credentials --platform android
```

Select:
- Profile: `production`
- Generate new keystore

EAS will securely store your keystore and manage signing automatically.

### Option B: Use Existing Keystore

If you have an existing keystore:

```bash
eas credentials --platform android
```

Select:
- Profile: `production`
- Upload existing keystore

Provide:
- Keystore file (.jks)
- Keystore password
- Key alias
- Key password

## Step 3: Google Play Console Setup

### 3.1 Create Developer Account

1. Go to [Google Play Console](https://play.google.com/console)
2. Pay the $25 registration fee
3. Complete identity verification (24-48 hours)

### 3.2 Create Your App

1. Click "Create app"
2. Fill in:
   - **App name**: Orbit
   - **Default language**: English (US)
   - **App or game**: App
   - **Free or paid**: Choose accordingly
3. Accept declarations

### 3.3 Prepare Store Listing

#### Required Screenshots

| Type | Dimensions | Quantity |
|------|------------|----------|
| Phone | 1080x1920 or 1440x2560 | Min 2, Max 8 |
| 7" Tablet | 1200x1920 | Optional |
| 10" Tablet | 1600x2560 | Optional |

#### Required Graphics

| Asset | Dimensions | Format |
|-------|------------|--------|
| App Icon | 512x512 | PNG (no alpha) |
| Feature Graphic | 1024x500 | PNG or JPEG |

#### Required Text

- **Short description**: Max 80 characters
- **Full description**: Max 4000 characters
- **Privacy Policy URL**: Required for all apps

### 3.4 Complete Content Rating

1. Go to Policy > App content > Content rating
2. Complete the questionnaire
3. Get your rating certificate

### 3.5 Complete Data Safety

1. Go to Policy > App content > Data safety
2. Declare what data your app collects
3. Explain how data is used and shared

## Step 4: Service Account for Automated Submissions

### 4.1 Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Go to IAM & Admin > Service Accounts
4. Click "Create Service Account"
5. Name: `eas-submit`
6. Grant role: (skip for now)
7. Create and download JSON key

### 4.2 Link to Play Console

1. In Play Console, go to Setup > API access
2. Link your Google Cloud project
3. Find your service account
4. Grant "Release manager" permission

### 4.3 Configure EAS

Save the JSON key as `google-service-account.json` in this directory.

> **Important**: This file is gitignored for security. Never commit it.

## Step 5: Build and Submit

### Build Production AAB

```bash
eas build --platform android --profile production
```

### Submit to Play Store

```bash
eas submit --platform android --profile production
```

Or manually:
1. Download AAB from [expo.dev](https://expo.dev) dashboard
2. Upload via Play Console > Release > Production

## Step 6: Environment Variables

### Configure EAS Secrets

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "your-production-supabase-url"
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-production-anon-key"
eas secret:create --name EXPO_PUBLIC_API_URL --value "https://your-app.fly.dev"
```

### View Configured Secrets

```bash
eas secret:list
```

## Step 7: CI/CD (GitHub Actions)

The workflow at `.github/workflows/eas-build.yml` automatically builds on pushes to `main`.

### Setup Required Secret

1. Go to your GitHub repo > Settings > Secrets
2. Add `EXPO_TOKEN`:
   - Get token from [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens)

## Release Checklist

Before each release:

- [ ] Update `version` in `app.json`
- [ ] Increment `versionCode` in `app.json` (required for each upload)
- [ ] Test on physical Android device
- [ ] Review crash reports in Play Console
- [ ] Update screenshots if UI changed
- [ ] Update store description if features changed

## Useful Commands

```bash
# Check build status
eas build:list

# View credentials
eas credentials --platform android

# Build preview APK (for testing)
eas build --platform android --profile preview

# Build production AAB
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android

# Configure secrets
eas secret:list
eas secret:create --name KEY --value "value"
```

## Troubleshooting

### Build Failed

1. Check build logs: `eas build:view`
2. Verify `app.json` configuration
3. Ensure all dependencies are compatible

### Submission Failed

1. Verify service account permissions
2. Check `google-service-account.json` path
3. Ensure app is created in Play Console first

### App Rejected

Common reasons:
- Missing privacy policy
- Incomplete data safety form
- Policy violations in content
- Deceptive functionality claims

## Support

- [Expo Docs](https://docs.expo.dev)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Submit](https://docs.expo.dev/submit/introduction/)
- [Play Console Help](https://support.google.com/googleplay/android-developer)
