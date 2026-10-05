import {
  faArrowLeft,
  faCalendar,
  faChevronDown,
  faDiamondTurnRight,
  faEllipsis,
  faLocationCrosshairs,
  faLocationDot,
  faMagnifyingGlass,
  faPhone,
  faShareNodes,
  faSliders,
  faStar,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

/**
 * Every icon is Font Awesome (Free, CC BY 4.0; credited on the about page), drawn as an inline
 * SVG from the icon's own path, so there is no icon font or CSS to load. Decorative: every
 * button has a text label or an accessible name.
 */
const ICONS = {
  phone: faPhone,
  directions: faDiamondTurnRight,
  share: faShareNodes,
  star: faStar,
  starOutline: faStarRegular,
  map: faLocationDot,
  calendar: faCalendar,
  locate: faLocationCrosshairs,
  sliders: faSliders,
  chevron: faChevronDown,
  close: faXmark,
  more: faEllipsis,
  search: faMagnifyingGlass,
  back: faArrowLeft,
  warning: faTriangleExclamation,
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { readonly name: IconName; readonly size?: number }) {
  const [width, height, , , path] = ICONS[name].icon;
  return (
    <svg
      className="icon"
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path d={typeof path === 'string' ? path : path.join(' ')} fill="currentColor" />
    </svg>
  );
}
