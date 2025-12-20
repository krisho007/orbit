/**
 * Diagnostic script to check Google import image issues
 * Run with: npx tsx scripts/diagnose-images.ts
 */

import { prisma } from '../lib/prisma'
import { supabase } from '../lib/supabase'

async function main() {
  console.log('🔍 Running Google Import Image Diagnostics...\n')

  // 1. Check if contacts have photoBase64 data in the last import
  const googleImportTag = await prisma.tag.findFirst({
    where: { name: 'Google Import' },
  })

  if (!googleImportTag) {
    console.log('❌ No "Google Import" tag found. Have you imported any contacts?')
    return
  }

  const contactsWithTag = await prisma.contact.findMany({
    where: {
      tags: {
        some: {
          tagId: googleImportTag.id
        }
      }
    },
    include: {
      images: true
    },
    take: 10
  })

  console.log(`📊 Found ${contactsWithTag.length} contacts with "Google Import" tag`)
  console.log(`📸 Contacts with images: ${contactsWithTag.filter(c => c.images.length > 0).length}`)
  console.log(`❌ Contacts without images: ${contactsWithTag.filter(c => c.images.length === 0).length}\n`)

  // 2. Check contact_images table
  const totalImages = await prisma.contactImage.count()
  console.log(`🖼️  Total images in database: ${totalImages}\n`)

  // 3. Check Supabase storage bucket
  console.log('🪣 Checking Supabase storage bucket "orbit"...')
  
  try {
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    
    if (bucketsError) {
      console.log(`❌ Error listing buckets: ${bucketsError.message}`)
    } else {
      const orbitBucket = buckets?.find(b => b.name === 'orbit')
      if (orbitBucket) {
        console.log(`✅ Bucket "orbit" exists (ID: ${orbitBucket.id})`)
        console.log(`   Public: ${orbitBucket.public ? '❌ Yes (not recommended for private data)' : '✅ No (secure - using signed URLs)'}`)
        
        // Try to list files in the bucket
        const { data: files, error: filesError } = await supabase.storage
          .from('orbit')
          .list('contact-images', { limit: 5 })
        
        if (filesError) {
          console.log(`❌ Error listing files in bucket: ${filesError.message}`)
          console.log(`   This might be a permissions issue.`)
        } else {
          console.log(`✅ Successfully accessed bucket`)
          console.log(`   Files in contact-images folder: ${files?.length || 0}`)
          if (files && files.length > 0) {
            console.log(`   Sample files:`)
            files.slice(0, 3).forEach(f => console.log(`     - ${f.name}`))
          }
        }
      } else {
        console.log(`❌ Bucket "orbit" NOT FOUND`)
        console.log(`   Available buckets: ${buckets?.map(b => b.name).join(', ') || 'none'}`)
        console.log(`\n   📝 ACTION REQUIRED: Create a bucket named "orbit" in Supabase:`)
        console.log(`      1. Go to Supabase Dashboard → Storage`)
        console.log(`      2. Create a new bucket named "orbit"`)
        console.log(`      3. Keep it PRIVATE (unchecked) - we use signed URLs for security`)
        console.log(`      4. Set up storage policies (see SUPABASE_STORAGE_SETUP.md)`)
      }
    }
  } catch (error) {
    console.log(`❌ Error checking Supabase: ${error}`)
  }

  console.log('\n🔍 Detailed sample of contacts without images:')
  const contactsWithoutImages = contactsWithTag.filter(c => c.images.length === 0).slice(0, 5)
  contactsWithoutImages.forEach(c => {
    console.log(`  - ${c.displayName} (${c.primaryEmail || 'no email'})`)
  })

  console.log('\n✅ Diagnosis complete!')
  console.log('\n💡 Next steps:')
  console.log('   1. Ensure the "orbit" storage bucket exists in Supabase (PRIVATE)')
  console.log('   2. Set up storage policies - see SUPABASE_STORAGE_SETUP.md')
  console.log('   3. Check server logs during import for upload errors')
  console.log('   4. Try re-importing with "Override existing contacts" checked')
  console.log('\n📖 For detailed setup instructions, see: SUPABASE_STORAGE_SETUP.md')
  
  await prisma.$disconnect()
}

main().catch(console.error)

