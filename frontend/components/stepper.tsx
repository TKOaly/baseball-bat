export const Stepper = ({
  stages,
  currentStage,
  loading = false,
}) => {
  const getStepStyle = (i) => {
    if (i < currentStage)
      return 'h-3 w-3 bg-blue-500';
    else
      return 'h-3 w-3 bg-gray-300';
  };

  return (
    <div className="relative flex justify-between items-center max-w-80 mx-auto mb-10">
      <div
        className="absolute left-1.5 right-1.5 h-1 bg-gray-300 top-1.5 transition"
      >
        <div
          className="absolute left-1.5 h-1 bg-blue-500 transition-all"
          style={{ width: `${currentStage / (stages.length - 1) * 100}%` }}
        />
      </div>
      {stages.map((stage, i) => (
        <div className="w-4 h-4 flex items-center justify-center" key={stage}>
          <div className={`relative flex-basis-[1em] rounded-full ${getStepStyle(i)} z-10`}>
            <div className="text-gray-600 w-80 left-[50%] -ml-40 text-center absolute text-sm top-[50%] mt-3" key={stage}>{stage}</div>
          </div>
        </div>
      ))}
      <div className="absolute inset-x-1.5">
        <div className={`absolute flex ${loading && 'animate-scale'} items-center justify-center overflow-hidden flex-basis-[1em] rounded-full h-4 w-4 -top-2 -ml-2 bg-blue-500 z-10 transition-all`} style={{ left: `${currentStage / (stages.length - 1) * 100}%` }}>
          <div className={'w-2 h-2 rounded-full bg-[#fbfbfb]'} />
          <div className="text-gray-600 w-80 left-[50%] -ml-40 text-center absolute text-sm top-[50%] mt-3" />
        </div>
      </div>
    </div>
  );
};
