interface HostCardProps {
  name: string;
  phoneVerified: boolean;
}

export function HostCard({ name, phoneVerified }: HostCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 p-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl font-semibold text-gray-600">
        {name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{name}</p>
        <div className="flex items-center gap-1 text-sm">
          {phoneVerified ? (
            <span className="text-green-600">✓ Phone verified</span>
          ) : (
            <span className="text-gray-400">Phone not verified</span>
          )}
        </div>
      </div>
    </div>
  );
}
