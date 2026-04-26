# Prismatic Pay

## Overview
A premium, developer-oriented design system that communicates trust, sophistication, and technical precision. Prismatic Pay combines a signature purple accent with rich gradient backgrounds and a dark navy canvas to create an aesthetic that feels both luxurious and engineering-grade. The design language bridges the gap between financial gravitas and developer-friendly approachability — gradients add visual richness while crisp typography and generous spacing maintain clarity.

## Colors
- **Primary** (#635BFF): Primary CTAs, active states, interactive highlights — Stripe Purple
- **Primary Hover** (#7A73FF): Hover state, slightly lighter and more vibrant
- **Secondary** (#0A2540): Deep containers, hero sections, premium surfaces — Stripe Navy
- **Neutral** (#697386): Secondary text, icons, muted labels — Cool Gray
- **Background** (#FFFFFF): Primary page background, documentation surfaces
- **Surface** (#F6F9FC): Code block backgrounds, card backgrounds, alternating sections
- **Text Primary** (#0A2540): Headlines, body text, primary labels — reuses Navy
- **Text Secondary** (#425466): Descriptions, secondary content, parameter text
- **Border** (#E3E8EE): Card outlines, input borders, table dividers
- **Success** (#30B130): Successful payments, test mode indicators, live badges
- **Warning** (#FFBB00): Pending states, attention badges, review needed
- **Error** (#DF1B41): Failed payments, validation errors, declined states

## Typography
- **Display Font**: Inter — loaded from Google Fonts
- **Body Font**: Inter — loaded from Google Fonts
- **Code Font**: Fira Code — loaded from Google Fonts

Inter is used throughout for its exceptional legibility and extensive weight range. Display text uses weights 600 and 700 with negative tracking for tight, authoritative headlines. Body text uses weight 400 and 500 at slightly loose tracking for comfortable reading. Fira Code brings programming ligatures to all code examples, terminal commands, and API references — a key differentiator for developer audiences. The type scale is deliberately restrained, favoring medium sizes for dense information display.

- **Hero**: Inter 60px/68px, weight 700, tracking -0.03em
- **Page Title**: Inter 40px/48px, weight 700, tracking -0.02em
- **Section Title**: Inter 28px/36px, weight 600, tracking -0.01em
- **Subsection**: Inter 20px/28px, weight 600
- **Body Large**: Inter 17px/28px, weight 400, tracking 0.01em
- **Body**: Inter 15px/24px, weight 400
- **Body Small**: Inter 13px/20px, weight 400
- **Label**: Inter 13px/16px, weight 500
- **Caption**: Inter 12px/16px, weight 400, tracking 0.02em
- **Code Block**: Fira Code 14px/24px, weight 400
- **Code Inline**: Fira Code 13px/20px, weight 400

## Elevation
The elevation system is layered and nuanced, using colored shadows that pick up ambient hues from gradient backgrounds. On white backgrounds: Level 1 (0 2px 4px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)), Level 2 (0 4px 8px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.06)), Level 3 (0 12px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)). On navy backgrounds (#0A2540): shadows use rgba(10,37,64,0.3) tinting. On gradient backgrounds: shadows pick up the dominant gradient hue at low opacity. Premium cards use a layered approach combining a close subtle shadow with a distant diffused one.

## Components
- **Buttons**: Primary uses #635BFF fill, white text, 36px height, 12px/16px padding, 6px border-radius, Inter 14px weight 500. Gradient variant uses linear-gradient(135deg, #635BFF 0%, #A259FF 100%). Secondary has #FFFFFF background, 1px #E3E8EE border, #0A2540 text, Level 1 shadow. All buttons transition background 150ms ease. Disabled state at 50% opacity. Icon button variant adds 4px gap before label.
- **Cards**: White background, 1px #E3E8EE border, 12px border-radius, 24px internal padding. Hover variant adds Level 2 shadow with 200ms ease. Feature cards on navy backgrounds use white fill with Level 2 shadow. Pricing cards have prominent header section with #635BFF accent. Code-preview cards split into description (white) and code (dark navy #0A2540) panels.
- **Inputs**: 40px height, white background, 1px #E3E8EE border, 6px border-radius, 12px horizontal padding, Inter 15px. Label above in 13px weight 500 #0A2540 with 4px margin-bottom. Focused state: 2px #635BFF border with #635BFF 10% opacity box-shadow ring (0 0 0 3px rgba(99,91,255,0.1)). Error state: 2px #DF1B41 border. Prefix/suffix elements (currency symbols, domains) in #F6F9FC background separated by internal border.
- **Chips**: 6px border-radius, 1px #E3E8EE border, Inter 13px weight 500, 4px/12px padding. Status chips: live (#30B130 background 10%, green text), test (#FFBB00 background 10%, amber text), failed (#DF1B41 background 10%, red text). Filter chips toggle between outlined and filled states.
- **Lists**: Table-style rows for transaction data. Row height 52px, 16px horizontal padding. Alternating #F6F9FC background optional. Header row in Inter 12px weight 600 uppercase tracking 0.05em #697386. Cell text in 14px #0A2540. Status cells use colored dot (8px) + label. Amount cells right-aligned in weight 500.
- **Checkboxes**: 16px square, 4px border-radius. Unchecked: 1px #E3E8EE border. Checked: #635BFF fill with white checkmark. Focus ring: 0 0 0 3px rgba(99,91,255,0.1). Toggle switches are 36px wide, 20px height, #635BFF when active.
- **Tooltips**: #0A2540 background, white text, 8px border-radius, 8px/12px padding, Inter 13px weight 400. Arrow pointing to trigger. Level 3 shadow. Supports rich content with code snippets in Fira Code.
- **Navigation**: Top bar 64px, white background, 1px #E3E8EE bottom border. Logo left, main nav center in Inter 15px weight 500, CTA buttons right. Documentation sidebar 280px, #F6F9FC background, collapsible sections. Active page indicator: 2px #635BFF left border with #635BFF text. Mobile: hamburger menu expanding to full-height drawer.
- **Search**: 40px height, #F6F9FC background, 6px border-radius, magnifying glass icon, Inter 15px. Keyboard shortcut badge (Ctrl+K style) shown right-aligned. Opens command palette modal on focus — full-width, 600px max-width, centered, with categorized results.

## Spacing
- Base unit: 8px
- Scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 80px, 120px
- Component padding: 16px standard, 24px for cards, 48px for hero sections
- Section spacing: 80px between major page sections, 32px between subsections
- Container max width: 1080px for documentation, 1200px for marketing pages, with 24px margins
- Card grid gap: 24px (feature grids), 16px (pricing grids)

## Border Radius
- 4px: Small badges, inline code tags, table cells
- 6px: Buttons, inputs, chips, dropdown menus
- 8px: Tooltips, small panels, notification bars
- 12px: Cards, modals, code blocks, feature panels
- 9999px: Pills, status badges, avatars, toggle switches

## Do's and Don'ts
- Do use gradients intentionally — they are the signature visual element, not decoration
- Don't apply gradients to small elements or text — reserve for hero backgrounds and premium cards
- Do pair code examples with every API feature — developer trust is built through transparency
- Don't use more than two type sizes in a single component
- Do maintain generous whitespace — premium brands breathe, they don't crowd
- Don't use the purple as a fill for large surface areas — it's an accent, not a background
- Do use the navy (#0A2540) for hero sections and high-impact areas
- Don't mix warm and cool grays — stick to the cool gray palette (697386, 425466, E3E8EE)
- Do provide focus rings on all interactive elements for keyboard accessibility
- Don't use more than one gradient direction per page — consistency prevents visual noise