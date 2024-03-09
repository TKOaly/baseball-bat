import { ExternalLink } from 'react-feather';
import { usePopperTooltip } from 'react-popper-tooltip';
import { useLocation } from 'wouter';
import { useFetchResourceDetails } from '../hooks/use-fetch-resource-details';

const RESOURCE_URL_FORMATS: Record<string, string> = {
  debt: '/admin/debts/%',
  email: '/admin/emails/%',
  payment: '/admin/payments/%',
  payer: '/admin/payers/%',
};

export const ResourceLink = (props: { type: string; id: string }) => {
  const {
    visible,
    getTooltipProps,
    getArrowProps,
    setTriggerRef,
    setTooltipRef,
  } = usePopperTooltip({
    interactive: true,
    followCursor: false,
    placement: 'top',
    delayShow: 300,
    offset: [0, 0],
  });
  const resourceDetails = useFetchResourceDetails(props.type, props.id);
  const [, setLocation] = useLocation();

  const handleClick = () => {
    const format = RESOURCE_URL_FORMATS[props.type];

    if (format) {
      setLocation(format.replace('%', props.id));
    }
  };

  return (
    <div>
      <div
        ref={setTriggerRef}
        className="inline-flex cursor-pointer items-center"
        onClick={handleClick}
      >
        {resourceDetails?.name}
        <ExternalLink className="relative h-4 text-blue-500" />
      </div>
      {visible && resourceDetails && (
        <div ref={setTooltipRef} {...getTooltipProps({ className: 'py-1' })}>
          <div className="z-10 rounded-md border border-gray-200 bg-white p-2 shadow-md">
            <table className="text-sm">
              <tr>
                <td colSpan={2}>
                  <div className="mb-2 flex items-center">
                    <span className="mr-2 rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold capitalize text-white">
                      {resourceDetails.type.replace(/_/g, ' ')}
                    </span>
                    <span>{resourceDetails.name}</span>
                  </div>
                </td>
              </tr>
              {(resourceDetails.details ?? []).map(([label, details]) => {
                let value = null;

                if (details.type === 'text') {
                  value = details.value;
                } else if (details.type === 'resource') {
                  value = (
                    <ResourceLink type={details.resourceType} id={details.id} />
                  );
                }

                return (
                  <tr key={label}>
                    <th className="pr-2 text-left text-gray-700">{label}</th>
                    <td>{value}</td>
                  </tr>
                );
              })}
            </table>
          </div>
          <div {...getArrowProps()}>
            <div
              className="absolute h-2 w-2 border-b border-r border-gray-200 bg-white"
              style={{
                marginTop: '-1px',
                transform: 'rotate(45deg) translate(-50%, 0%)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
