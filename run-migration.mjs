import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://txldnqhqsgtqttpzbkeq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FfSXeg7MY_fQvuot_uIdWQ_eot3x8jr';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMigration() {
  try {
    console.log('Removing translation section from database...\n');
    
    // Step 1: Get the translation section type ID
    const { data: translationSectionTypes, error: fetchError } = await sb
      .from('section_types')
      .select('id')
      .eq('slug', 'translation');
    
    if (fetchError) {
      console.error('Error fetching translation section type:', fetchError);
      process.exit(1);
    }

    if (!translationSectionTypes || translationSectionTypes.length === 0) {
      console.log('ℹ Translation section type not found in database (already removed or never existed)');
    } else {
      const translationSectionTypeId = translationSectionTypes[0].id;
      console.log(`✓ Found translation section type ID: ${translationSectionTypeId}`);

      // Step 2: Delete all newsletter_sections entries referencing the translation type
      console.log('\nDeleting newsletter sections with type = translation...');
      const { error: deleteNewsletterError, count } = await sb
        .from('newsletter_sections')
        .delete()
        .eq('section_type_id', translationSectionTypeId);
      
      if (deleteNewsletterError) {
        console.error('Error deleting newsletter sections:', deleteNewsletterError);
      } else {
        console.log(`✓ Deleted ${count || 0} newsletter section entries`);
      }

      // Step 3: Delete the translation section_type record
      console.log('\nDeleting section_type record (slug = translation)...');
      const { error: deleteTypeError } = await sb
        .from('section_types')
        .delete()
        .eq('slug', 'translation');
      
      if (deleteTypeError) {
        console.error('Error deleting section type:', deleteTypeError);
        process.exit(1);
      } else {
        console.log('✓ Translation section type record deleted');
      }
    }

    // Step 4: Verify the translation section is gone
    console.log('\nVerifying removal...');
    const { data: remaining, error: verifyError } = await sb
      .from('section_types')
      .select('id, slug, name_ar')
      .eq('slug', 'translation');
    
    if (verifyError) {
      console.error('Verification error:', verifyError);
      process.exit(1);
    } else if (!remaining || remaining.length === 0) {
      console.log('✓ Verification successful: Translation section completely removed!\n');
      console.log('The الترجمة section will no longer appear in the UI.');
      process.exit(0);
    } else {
      console.log('⚠ Warning: Translation section still exists in database');
      process.exit(1);
    }
  } catch (e) {
    console.error('Unexpected error:', e.message || e);
    process.exit(1);
  }
}

runMigration();
