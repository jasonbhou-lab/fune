import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";

const STROKE_PROPS = { fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export default function CategoryIcon({ id, size = 18, color = "#3E5C55" }) {
  const s = { ...STROKE_PROPS, stroke: color };
  const box = { width: size, height: size, viewBox: "0 0 24 24" };

  switch (id) {
    case "funeral_services":
      return (
        <Svg {...box}>
          <Path d="M12 3c1.2 1.6 1.2 3 0 4.2C10.8 6 10.8 4.6 12 3z" {...s} />
          <Rect x="10" y="8" width="4" height="12" rx="1" {...s} />
          <Path d="M8 20h8" {...s} />
        </Svg>
      );
    case "cremation":
      return (
        <Svg {...box}>
          <Path d="M9 4h6v2a3 3 0 01-6 0V4z" {...s} />
          <Path d="M8 9c-1 5 0 11 4 11s5-6 4-11" {...s} />
          <Path d="M7 9h10" {...s} />
        </Svg>
      );
    case "preparation_care":
      return (
        <Svg {...box}>
          <Path d="M5 14c0 4 3 6 7 6s7-2 7-6" {...s} />
          <Circle cx="12" cy="8" r="2.6" {...s} />
        </Svg>
      );
    case "facilities_staff":
      return (
        <Svg {...box}>
          <Path d="M4 20V10l8-5 8 5v10" {...s} />
          <Path d="M4 20h16" {...s} />
          <Rect x="10" y="13" width="4" height="7" {...s} />
        </Svg>
      );
    case "transportation":
      return (
        <Svg {...box}>
          <Rect x="3" y="12" width="18" height="6" rx="2" {...s} />
          <Circle cx="8" cy="18" r="1.4" {...s} />
          <Circle cx="16" cy="18" r="1.4" {...s} />
          <Path d="M5 12l2-5h10l2 5" {...s} />
        </Svg>
      );
    case "burial_interment":
      return (
        <Svg {...box}>
          <Path d="M7 20V11a5 5 0 0110 0v9" {...s} />
          <Path d="M4 20h16" {...s} />
        </Svg>
      );
    case "cemetery_property":
      return (
        <Svg {...box}>
          <Rect x="4" y="4" width="16" height="16" rx="1.5" {...s} />
          <Path d="M12 4v16M4 12h16" {...s} />
        </Svg>
      );
    case "merchandise":
      return (
        <Svg {...box}>
          <Rect x="4" y="8" width="16" height="10" rx="1.5" {...s} />
          <Path d="M4 12h16" {...s} />
        </Svg>
      );
    case "memorialization":
      return (
        <Svg {...box}>
          <Rect x="5" y="5" width="14" height="14" rx="1.5" {...s} />
          <Path d="M9 10h6M9 14h6" {...s} />
        </Svg>
      );
    case "planning_support":
      return (
        <Svg {...box}>
          <Rect x="6" y="4" width="12" height="17" rx="1.5" {...s} />
          <Path d="M9 4h6v2H9z" {...s} />
          <Path d="M9 12l2 2 4-4" {...s} />
        </Svg>
      );
    case "addons_third_party":
      return (
        <Svg {...box}>
          <Circle cx="12" cy="8" r="1.8" {...s} />
          <Circle cx="8" cy="11" r="1.8" {...s} />
          <Circle cx="16" cy="11" r="1.8" {...s} />
          <Circle cx="10" cy="15" r="1.8" {...s} />
          <Circle cx="14" cy="15" r="1.8" {...s} />
          <Path d="M12 15v6" {...s} />
        </Svg>
      );
    default:
      return (
        <Svg {...box}>
          <Circle cx="12" cy="12" r="8" {...s} />
        </Svg>
      );
  }
}
