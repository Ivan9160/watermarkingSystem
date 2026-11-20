import { useEffect, useRef } from 'react';

export function LibraryGroupCheckbox({ checked, indeterminate, onChange, label }: {
    checked: boolean;
    indeterminate: boolean;
    onChange: () => void;
    label: string;
}) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);
    return <input ref={ref} type="checkbox" className="library-product-group__check"
        checked={checked} onChange={onChange} aria-label={label} />;
}
