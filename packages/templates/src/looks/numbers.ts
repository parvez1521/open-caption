/**
 * Every built-in look has a permanent number, shown after its name in the gallery ("Karaoke Fill #3").
 * A look's number is its position in this list (1-based). APPEND new looks at the end, never reorder or remove
 * entries: the numbers are what creators remember and quote. A retired look keeps its slot.
 */
export const LOOK_NUMBER_ORDER: readonly string[] = [
  "metal_script", "soft_glow", "neon_duo", "serif_behind", "ice_duo", "serif_accent_glow",
  "staggered_splash", "glow_stack_classic", "vintage_cinematic", "serif_pop_classic", "kinetic_mix", "hormozi_box",
  "beast_bounce", "comic_burst", "chat_bubble", "explainer", "highlighter_card", "tri_color_keywords",
  "gold_bevel_caps", "solid_label_card", "tilted_label_stack", "cream_strip_lines", "tilted_rising_rows", "whip_in_cards",
  "light_to_bold", "orange_stamp_hoist", "red_plate_ticker", "sand_word_tiles", "color_block_cutin", "motion_blur_whip",
  "fat_bar_pop", "creator_skew_ice", "creator_shine_title", "creator_neon_title", "creator_gloss_serif", "creator_golden_glow",
  "creator_shine_band", "creator_glide_stack", "creator_shine_sweep", "creator_arcade_door", "creator_block_middle", "creator_three_part",
  "creator_fusion_type", "creator_sparkle_script", "creator_pastel_bubble", "estate_blend_word", "estate_blend_subline", "estate_blend_overlay",
  "estate_blend_stack", "dyn_estate_cycle", "dyn_classic_cycle", "dyn_creator_cycle", "dyn_simple_cycle", "dyn_doctor_cycle",
  "dyn_luxe_cycle", "typo_banded_word", "typo_rotating_layouts", "typo_ghost_stack", "typo_huge_script", "typo_six_slot",
  "typo_red_neon", "typo_big_small", "typo_red_block_wipe", "typo_punch_slide", "typo_scatter_fly", "typo_longest_big",
  "typo_spotlight_sides", "typo_gilded_headline", "typo_editorial_indent", "plain_lowercase", "fade_in_words", "stacked_slam",
  "script_accent_pink", "italic_glow_word", "glow_serif_popin", "cycling_color_pop", "gold_word_lift", "mint_caps_pop",
  "yellow_jump_box", "hollow_caps_fill", "karaoke_pill", "selection_highlight", "cyan_bloom", "slanted_shine",
  "peak_gradient", "olive_word_pill", "knockout_word", "die_cut_sticker", "ransom_cutouts", "ransom_flicker",
  "torn_paper_cutout", "neon_frame_lines", "phone_notification", "mint_chat_pop", "mint_chat_pop_left", "karaoke_fill",
  "pop_clean", "gradient_pop", "outline_fill", "bold_pill", "wave_bounce", "storytime",
  "scribble", "minimal_pro", "netflix_sub", "lower_third", "read_along", "luxe_serif",
  "motivational", "film_noir", "retro_vhs", "retro_3d", "neon_sign", "terminal",
  "gaming_hud", "desi_clean", "cartoon_stack_classic",
  // Premium motion (After Effects-grade)
  "difference_invert", "cinematic_track_in", "rgb_split_slam", "letter_cascade", "light_slit_reveal",
  "flip_3d_type", "glitch_slice", "chrome_sweep", "echo_zoom", "kinetic_camera",
  // Premium Plus (appended 2026-11-09; numbers are permanent, append-only)
  "apex_kinetic", "rush_cut", "emerald_karaoke_pro", "amber_box_sweep", "focus_blur", "broadcast_lower",
  "stack_attack", "typecraft", "velvet_editorial", "ember_rush", "marker_pro", "duo_headline",
  "noir_title", "studio_bubble", "glitch_reveal", "slam_stack", "halo_serif", "pill_pop_pro",
  "underline_pro", "wave_rider", "gold_frame", "bubble_noir",
  // Slice 1 showcase (appended 2026-11-09; numbers are permanent, append-only)
  "typed_caret", "slice_signal", "scribble_ring", "amber_sweep_box",
  "typed_slate", "slice_one_word", "marker_ring", "mint_sweep_pill",
  // Envato-styles wave (appended 2026-11-10; numbers are permanent, append-only)
  "neon_strike_mint", "neon_strike_amber", "decode_resolve", "decode_hero",
  "block_reveal_obsidian", "block_reveal_mint", "roll_hero", "roll_stack",
  "pen_reveal_dark", "pen_reveal_paper", "jelly_settle", "jelly_one_word",
];

/**
 * Looks taken out of the gallery (by number). They keep their number and still resolve through getLook(), so projects
 * that already use one keep rendering exactly as before; they just can't be picked any more.
 */
export const RETIRED_LOOK_NUMBERS: ReadonlySet<number> = new Set([
  46, 47, 48, 49, 54, 57, 58, 60, 66, 68, 75, 77, 83, 84, 86, 88, 94, 95, 96, 97, 99, 100, 106, 110, 112, 113, 115, 116,
]);

const numbers = new Map(LOOK_NUMBER_ORDER.map((id, i) => [id, i + 1]));
/** the look's permanent number (undefined for saved "My looks") */
export const lookNumber = (id: string): number | undefined => numbers.get(id);
/** true when the look was taken out of the gallery */
export const isRetiredLook = (id: string): boolean => RETIRED_LOOK_NUMBERS.has(numbers.get(id) ?? -1);
