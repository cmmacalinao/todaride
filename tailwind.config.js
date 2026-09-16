/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Everything below driven off a CSS variable (`rgb(var(--x) /
        // <alpha-value>)`) instead of a fixed hex is a THEMEABLE token — its
        // actual colour comes from whichever `[data-theme="…"]` is set on
        // <html> (see src/theme.css), so every existing `bg-brand-600`,
        // `text-gold-400`, `bg-navy-900` etc. across the app re-skins with a
        // theme switch, with no change needed at the call site. `royal`,
        // `success`, `surface` and `danger` stay fixed hex on purpose — see
        // each for why.
        //
        // Teal is the app's colour now, top to bottom: primary buttons, active
        // states, links, anything the eye should land on. Teal reads as safety
        // and calm rather than as a tech product, which is the right note for
        // something families put their children in. Themeable: this is the
        // one a different colour concept replaces first.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        // The soft surface that carries teal text: quiet panels, anywhere a
        // filled block would shout. Themeable, same reasons as brand.
        mint: {
          50: 'rgb(var(--mint-50) / <alpha-value>)',
          100: 'rgb(var(--mint-100) / <alpha-value>)',
          200: 'rgb(var(--mint-200) / <alpha-value>)',
          300: 'rgb(var(--mint-300) / <alpha-value>)',
        },
        // The Destination field's own colour, kept apart from `danger` on
        // purpose (see danger below) even though a bold theme's Destination
        // fill can land on a red — it is never THE emergency red, just a
        // colour that happens to also be red. fill/text/subtext/dot are the
        // four roles the Destination button actually needs, not a
        // light-to-dark numeric scale, because a bold theme's Destination is
        // a solid fill with white text and a quiet theme's is a pale fill
        // with dark text — same four slots, opposite treatment. Themeable.
        dest: {
          fill: 'rgb(var(--dest-fill) / <alpha-value>)',
          text: 'rgb(var(--dest-text) / <alpha-value>)',
          subtext: 'rgb(var(--dest-subtext) / <alpha-value>)',
          dot: 'rgb(var(--dest-dot) / <alpha-value>)',
          // A saturated destination colour for small solid badges/toggles
          // that always carry white text — distinct from `fill`, which goes
          // pale in the default theme and would fail contrast here.
          accent: 'rgb(var(--dest-accent) / <alpha-value>)',
        },
        // The Pickup panel's own solid-fill colour — always a bold fill with
        // white text (unlike `dest`, Pickup never goes pale), so it only
        // ever needs the one role. Teal in every theme so far, but themeable
        // rather than the old inline hex so a monochrome concept can move it
        // to match everything else.
        pickup: {
          accent: 'rgb(var(--pickup-accent) / <alpha-value>)',
        },
        // ROYAL BLUE #1E3A8A — trust and professionalism. The wordmark's own
        // blue, kept as a token so anything quoting the brand can reach it.
        // Fixed, not themeable: this is the actual logo artwork's colour, and
        // the logo image itself does not re-skin with the theme.
        royal: {
          600: '#1e3a8a',
          700: '#182f6f',
        },
        // SUCCESS GREEN #16A34A — a journey completed, a payment received.
        // Distinct from the primary teal on purpose: teal is the brand, this
        // is an outcome. Fixed: an outcome colour should read the same
        // regardless of which brand theme is active.
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#16a34a',
          600: '#12833b',
          700: '#0e6a30',
        },
        // LIGHT GRAY #F4F6F8 — the page ground everything else sits on.
        // Fixed: a neutral is supposed to stay neutral across themes.
        surface: {
          DEFAULT: '#f4f6f8',
          50: '#f9fafb',
          100: '#f4f6f8',
        },
        // SUNSHINE YELLOW #FFC300 — warmth and energy, and the wordmark's
        // own accent. Anchors gold-400, which is what every strip and banner
        // in the app already asks for. Themeable: a "clean/professional"
        // theme trades the warm yellow for a cool neutral instead.
        gold: {
          50: 'rgb(var(--gold-50) / <alpha-value>)',
          100: 'rgb(var(--gold-100) / <alpha-value>)',
          400: 'rgb(var(--gold-400) / <alpha-value>)',
          500: 'rgb(var(--gold-500) / <alpha-value>)',
          600: 'rgb(var(--gold-600) / <alpha-value>)',
        },
        // Deep Navy #061A3A is THE brand ground — headers, footers, dark
        // buttons, every page. Nothing in this app should be black: the
        // previous steps sat near #0a1530/#060d1f and read as black on a
        // phone, which flattened the blue the logo's pin and gold wordmark
        // were drawn against.
        //
        // 950 is one step deeper, reserved for the logo panel so the mark
        // sits in its own well rather than dissolving into a navy header
        // behind it. It is still visibly navy — deliberately not pushed far
        // enough to read as black.
        //
        // 800 and 700 go lighter, for hover states and borders: on a dark
        // button, hover has to move up, not down.
        //
        // Kept under the name 'navy' on purpose: every page, banner and strip
        // already refers to it, and renaming the token across the app would
        // be a large diff that changes nothing a user can see. Themeable —
        // each theme's own dark ground, deep teal in the default and an
        // actual navy in a blue one.
        navy: {
          700: 'rgb(var(--navy-700) / <alpha-value>)',
          800: 'rgb(var(--navy-800) / <alpha-value>)',
          900: 'rgb(var(--navy-900) / <alpha-value>)',
          950: 'rgb(var(--navy-950) / <alpha-value>)',
        },
        // RESERVED FOR EMERGENCIES. `danger` is the SOS/panic colour and
        // nothing else — not validation errors, not rejected registrations,
        // not negative balances, not delete buttons. The point is that when a
        // rider or driver sees this red anywhere in the app it means someone
        // is in trouble; every decorative use dilutes that signal.
        //
        // Reach for `amber` instead for errors, warnings, rejections and
        // destructive actions. If you want `danger` and the screen is not
        // about an emergency, it is the wrong token.
        //
        // Material Red, anchored on danger-600 = #E53935. Fixed on purpose —
        // an emergency colour cannot mean something different because a
        // theme switch happened to also land on red.
        danger: {
          50: '#ffebee',
          100: '#ffcdd2',
          200: '#ef9a9a',
          300: '#e57373',
          400: '#ef5350',
          500: '#f44336',
          600: '#e53935',
          700: '#d32f2f',
          800: '#c62828',
          900: '#b71c1c',
        },
      },
      // A soft yellow wash that fades in and out on a button the rider is
      // being asked to press — noticeable without the alarm of the SOS pulse.
      keyframes: {
        'blink-yellow': {
          '0%, 100%': { backgroundColor: '#fffbeb', boxShadow: '0 0 0 0 rgba(250, 204, 21, 0)' },
          '50%': { backgroundColor: '#fde68a', boxShadow: '0 0 0 4px rgba(250, 204, 21, 0.35)' },
        },
      },
      animation: {
        'blink-yellow': 'blink-yellow 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
