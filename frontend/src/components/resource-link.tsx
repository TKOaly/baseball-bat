import { ExternalLink } from 'react-feather';
import { usePopperTooltip } from 'react-popper-tooltip';
import { useLocation } from 'wouter';
import { useFetchResourceDetails } from '../hooks/use-fetch-resource-details';

const RESOURCE_URL_FORMATS = {
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
        className="inline-flex items-center cursor-pointer"
        onClick={handleClick}
      >
        {resourceDetails?.name}
        <ExternalLink className="h-4 text-blue-500 relative" />
      </div>
      {visible && resourceDetails && (
        <div ref={setTooltipRef} {...getTooltipProps({ className: 'py-1' })}>
          <div className="rounded-md border border-gray-200 shadow-md bg-white z-10 p-2">
            <table className="text-sm">
              <tr>
                <td colSpan={2}>
                  <div className="flex items-center mb-2">
                    <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-2 capitalize">
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
                    <th className="text-left text-gray-700 pr-2">{label}</th>
                    <td>{value}</td>
                  </tr>
                );
              })}
            </table>
          </div>
          <div {...getArrowProps()}>
            <div
              className="w-2 h-2 bg-white absolute border-r border-b border-gray-200"
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
