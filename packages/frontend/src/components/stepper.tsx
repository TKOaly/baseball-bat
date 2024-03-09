export type Props = {
  stages: string[];
  currentStage: number;
  loading?: boolean;
};

export const Stepper: React.FC<Props> = ({
  stages,
  currentStage,
  loading = false,
}) => {
  const getStepStyle = (i: number) => {
    if (i < currentStage) return 'h-3 w-3 bg-blue-500';
    else return 'h-3 w-3 bg-gray-300';
  };

  return (
    <div className="max-w-80 relative mx-auto mb-10 flex items-center justify-between">
      <div className="absolute left-1.5 right-1.5 top-1.5 h-1 bg-gray-300 transition">
        <div
          className="absolute left-1.5 h-1 bg-blue-500 transition-all"
          style={{ width: `${(currentStage / (stages.length - 1)) * 100}%` }}
        />
      </div>
      {stages.map((stage, i) => (
        <div className="flex h-4 w-4 items-center justify-center" key={stage}>
          <div
            className={`flex-basis-[1em] relative rounded-full ${getStepStyle(
              i,
            )} z-10`}
          >
            <div
              className="absolute left-[50%] top-[50%] -ml-40 mt-3 w-80 text-center text-sm text-gray-600"
              key={stage}
            >
              {stage}
            </div>
          </div>
        </div>
      ))}
      <div className="absolute inset-x-1.5">
        <div
          className={`absolute flex ${
            loading && 'animate-scale'
          } flex-basis-[1em] -top-2 z-10 -ml-2 h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-blue-500 transition-all`}
          style={{ left: `${(currentStage / (stages.length - 1)) * 100}%` }}
        >
          <div className={'h-2 w-2 rounded-full bg-[#fbfbfb]'} />
          <div className="absolute left-[50%] top-[50%] -ml-40 mt-3 w-80 text-center text-sm text-gray-600" />
        </div>
      </div>
    </div>
  );
};
