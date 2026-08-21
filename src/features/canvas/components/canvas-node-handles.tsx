import { Handle, Position } from '@xyflow/react';

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

const handleClassName = '!size-2.5 !border-2 !border-white !bg-[#176bff] !z-10';

export function CanvasNodeHandles({ nodeId }: { nodeId: string }) {
  return (
    <>
      {SIDES.map(({ id, position }) => (
        <Handle
          key={id}
          type="source"
          position={position}
          id={id}
          className={handleClassName}
          data-testid={`canvas-handle-${nodeId}-${id}`}
        />
      ))}
    </>
  );
}
