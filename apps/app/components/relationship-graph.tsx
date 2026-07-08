import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";
import { getThemeColor, useThemeColors } from "../lib/theme";
import type { Relationship } from "../lib/api";

type GraphNode = SimulationNodeDatum & {
  id: string;
  label: string;
  isCenter: boolean;
};

type GraphLink = SimulationLinkDatum<GraphNode> & {
  label: string;
};

type Props = {
  contactId: string;
  contactName: string;
  relationships: Relationship[];
  width: number;
  height: number;
  onNodePress?: (contactId: string) => void;
};

export function RelationshipGraph({
  contactId,
  contactName,
  relationships,
  width,
  height,
  onNodePress,
}: Props) {
  const colors = useThemeColors();
  const primaryColor = getThemeColor(colors, "primary-600");
  const secondaryColor = getThemeColor(colors, "primary-400");
  const textColor = getThemeColor(colors, "typography-900");
  const labelColor = getThemeColor(colors, "typography-500");
  const edgeColor = getThemeColor(colors, "border-300");

  const { nodes, links } = useMemo(() => {
    if (relationships.length === 0) return { nodes: [], links: [] };

    const nodeMap = new Map<string, GraphNode>();

    // Center node
    nodeMap.set(contactId, {
      id: contactId,
      label: contactName,
      isCenter: true,
      x: width / 2,
      y: height / 2,
    });

    const graphLinks: GraphLink[] = [];

    for (const rel of relationships) {
      const isFrom = rel.fromContactId === contactId;
      const otherId = isFrom ? rel.toContactId : rel.fromContactId;
      const otherName = isFrom
        ? rel.toContact?.displayName || "Unknown"
        : rel.fromContact?.displayName || "Unknown";
      const typeLabel = rel.type?.name || "Related";

      if (!nodeMap.has(otherId)) {
        nodeMap.set(otherId, {
          id: otherId,
          label: otherName,
          isCenter: false,
        });
      }

      graphLinks.push({
        source: contactId,
        target: otherId,
        label: typeLabel,
      });
    }

    const nodeArray = Array.from(nodeMap.values());

    // Run d3-force simulation synchronously
    const sim = forceSimulation<GraphNode>(nodeArray)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(graphLinks)
          .id((d) => d.id)
          .distance(Math.min(width, height) * 0.3)
      )
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(30))
      .stop();

    // Run simulation ticks
    for (let i = 0; i < 120; i++) {
      sim.tick();
    }

    // Clamp positions within bounds
    const pad = 30;
    for (const node of nodeArray) {
      node.x = Math.max(pad, Math.min(width - pad, node.x || width / 2));
      node.y = Math.max(pad, Math.min(height - pad, node.y || height / 2));
    }

    return { nodes: nodeArray, links: graphLinks };
  }, [contactId, contactName, relationships, width, height]);

  if (nodes.length === 0) {
    return null;
  }

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* Edges */}
        {links.map((link, i) => {
          const source = link.source as GraphNode;
          const target = link.target as GraphNode;
          const mx = ((source.x || 0) + (target.x || 0)) / 2;
          const my = ((source.y || 0) + (target.y || 0)) / 2;

          return (
            <G key={`link-${i}`}>
              <Line
                x1={source.x || 0}
                y1={source.y || 0}
                x2={target.x || 0}
                y2={target.y || 0}
                stroke={edgeColor}
                strokeWidth={1.5}
              />
              <SvgText
                x={mx}
                y={my - 6}
                fontSize={9}
                fill={labelColor}
                textAnchor="middle"
              >
                {link.label}
              </SvgText>
            </G>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const r = node.isCenter ? 24 : 18;
          const fill = node.isCenter ? primaryColor : secondaryColor;
          const initials = getInitials(node.label);
          const handlePress = !node.isCenter && onNodePress
            ? () => onNodePress(node.id)
            : undefined;

          return (
            <G key={node.id} onPress={handlePress}>
              <Circle
                cx={node.x || 0}
                cy={node.y || 0}
                r={r}
                fill={fill}
              />
              <SvgText
                x={node.x || 0}
                y={(node.y || 0) + 4}
                fontSize={node.isCenter ? 12 : 10}
                fill="white"
                textAnchor="middle"
                fontWeight="bold"
              >
                {initials}
              </SvgText>
              <SvgText
                x={node.x || 0}
                y={(node.y || 0) + r + 14}
                fontSize={10}
                fill={textColor}
                textAnchor="middle"
              >
                {node.label.length > 12
                  ? node.label.slice(0, 11) + "..."
                  : node.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
