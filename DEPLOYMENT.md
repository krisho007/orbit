# Orbit Deployment Checklist

## Pre-Deployment Steps

### 1. Environment Setup
- [ ] Set up production PostgreSQL database
- [ ] Configure Supabase project and storage bucket
- [ ] Create Google OAuth credentials with production callback URL
- [ ] Generate AUTH_SECRET: `openssl rand -base64 32`
- [ ] Obtain OpenAI API key

### 2. Database Preparation
- [ ] Run `npx prisma generate` to ensure client is up to date
- [ ] Run `npx prisma migrate deploy` in production (not migrate dev!)
- [ ] Verify all tables are created
- [ ] Test database connection

### 3. Security Review
- [ ] All environment variables in `.env.local` are NOT committed
- [ ] AUTH_SECRET is strong and unique
- [ ] Database credentials are secure
- [ ] API keys are production-ready
- [ ] Google OAuth redirect URIs include production URL

### 4. Code Quality
- [ ] Run `npm run build` locally to catch build errors
- [ ] Fix any TypeScript errors
- [ ] Test all major user flows
- [ ] Verify image uploads work
- [ ] Test AI assistant functionality

## Vercel Deployment

### 1. Initial Setup
1. Push code to GitHub repository
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Add New Project"
4. Import your GitHub repository
5. Configure project settings

### 2. Environment Variables
Add all variables from `.env.local` in Vercel:

**Build & Development & Production:**
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `NEXTAUTH_URL` (set to your production URL: https://yourdomain.com)

### 3. Build Configuration
- Framework Preset: **Next.js**
- Build Command: `npm run build` (default)
- Output Directory: `.next` (default)
- Install Command: `npm install` (default)

### 4. Deploy
1. Click "Deploy"
2. Wait for deployment to complete
3. Test your deployment URL

## Post-Deployment Steps

### 1. Google OAuth Update
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your OAuth credentials
3. Add authorized redirect URI: `https://yourdomain.com/api/auth/callback/google`
4. Save changes

### 2. Database Migration
```bash
# Connect to production database and run migrations
DATABASE_URL="your-production-url" npx prisma migrate deploy
```

### 3. Verify Functionality
- [ ] Landing page loads correctly
- [ ] Google OAuth login works
- [ ] User can create contacts
- [ ] User can create conversations
- [ ] User can create events
- [ ] AI assistant responds correctly
- [ ] Image upload works
- [ ] Settings page loads
- [ ] Mobile responsive design works
- [ ] PWA is installable

### 4. Supabase Storage Policies
Create RLS policies for the `orbit` bucket:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'orbit');

-- Allow authenticated users to read their own images
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'orbit');

-- Allow authenticated users to delete their own images
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'orbit');
```

### 5. PWA Icons
- [ ] Replace `/public/icon-192.png` with actual 192x192px icon
- [ ] Replace `/public/icon-512.png` with actual 512x512px icon
- [ ] Test PWA installation on mobile device

## Monitoring & Maintenance

### 1. Set Up Monitoring
- [ ] Enable Vercel Analytics
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Monitor database performance
- [ ] Monitor OpenAI API usage and costs

### 2. Regular Maintenance
- [ ] Monitor database size and backups
- [ ] Check Supabase storage usage
- [ ] Review OpenAI API costs
- [ ] Update dependencies regularly
- [ ] Apply security patches

### 3. Scaling Considerations
- [ ] Database connection pooling (already handled by Prisma)
- [ ] Consider Redis for session storage at scale
- [ ] Monitor Vercel function execution time
- [ ] Add rate limiting for AI assistant endpoint
- [ ] Consider CDN for static assets

## Troubleshooting

### Authentication Issues
- Verify `AUTH_SECRET` is set
- Check Google OAuth redirect URIs
- Ensure `NEXTAUTH_URL` matches deployment URL
- Check Auth.js v5 documentation

### Database Connection Issues
- Verify `DATABASE_URL` format
- Check database is accessible from Vercel
- Ensure SSL is configured if required
- Check connection limits

### Build Failures
- Run `npm run build` locally
- Check for TypeScript errors
- Verify all environment variables are set
- Review Vercel build logs

### Image Upload Issues
- Verify Supabase credentials
- Check storage bucket exists and is public
- Review Supabase storage policies
- Check CORS settings

### AI Assistant Issues
- Verify OpenAI API key is valid
- Check API quota and billing
- Review function calling format
- Test with simple queries first

## Backup Strategy

### Database Backups
- Enable automatic backups on your database provider
- Export schema regularly: `npx prisma db pull`
- Test restoration process

### Environment Variables
- Keep secure backup of all environment variables
- Document any changes

### Code
- Use Git for version control
- Tag releases
- Document major changes

## Security Best Practices

- [ ] Keep dependencies updated
- [ ] Monitor for security vulnerabilities
- [ ] Use environment variables for all secrets
- [ ] Enable HTTPS only (Vercel handles this)
- [ ] Review and update Google OAuth scopes
- [ ] Implement rate limiting for API routes
- [ ] Monitor for suspicious activity
- [ ] Regular security audits

## Cost Optimization

### Free Tier Limits
- **Vercel**: 100GB bandwidth, 6000 build minutes/month
- **Supabase**: 500MB database, 1GB storage
- **OpenAI**: Pay per token, monitor usage

### Tips
- Optimize images before upload
- Use database indexes effectively (already done)
- Cache frequently accessed data
- Monitor and optimize AI assistant prompts
- Set up billing alerts

## Support Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Vercel Docs](https://vercel.com/docs)
- [Auth.js v5 Docs](https://authjs.dev/)
- [Prisma Docs](https://www.prisma.io/docs)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)


