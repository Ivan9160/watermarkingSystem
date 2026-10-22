import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { useApp } from './AppContext';
import type { WatermarkSettings, WatermarkType } from '../types';

const STORAGE_KEY = 'waterm.watermarkTemplates.v1';

export interface WatermarkTemplate {
    id: string;
    name: string;
    description: string;
    settings: WatermarkSettings;
    watermarkType: WatermarkType;
    createdAt: string;
    updatedAt: string;
}

interface TemplateContextValue {
    templates: WatermarkTemplate[];
    activeTemplate: WatermarkTemplate | undefined;
    isModified: boolean;
    storageError: string | null;
    applyTemplate: (id: string) => void;
    saveCurrentAsTemplate: (name: string, description?: string) => string | null;
    updateActiveTemplate: () => void;
    renameTemplate: (id: string, name: string) => void;
    duplicateTemplate: (id: string) => void;
    deleteTemplate: (id: string) => void;
    detachTemplate: () => void;
}

const TemplateContext = createContext<TemplateContextValue | null>(null);

function isValidSettings(value: unknown): value is WatermarkSettings {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
        typeof item.text === 'string' &&
        typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color) &&
        typeof item.opacity === 'number' && item.opacity >= 0 && item.opacity <= 100 &&
        typeof item.size === 'number' && item.size >= 2 && item.size <= 12 &&
        (item.layout === 'single' || item.layout === 'pattern') &&
        ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'].includes(String(item.position))
    );
}

function isValidTemplate(value: unknown): value is WatermarkTemplate {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
        typeof item.id === 'string' && item.id.length > 0 &&
        typeof item.name === 'string' && item.name.trim().length > 0 &&
        typeof item.description === 'string' &&
        (item.watermarkType === 'visible' || item.watermarkType === 'invisible') &&
        typeof item.createdAt === 'string' &&
        typeof item.updatedAt === 'string' &&
        isValidSettings(item.settings)
    );
}

function readSavedTemplates(): WatermarkTemplate[] {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isValidTemplate).map(item => ({
            ...item,
            settings: { ...item.settings },
        }));
    } catch {
        return [];
    }
}

function settingsMatch(a: WatermarkSettings, b: WatermarkSettings): boolean {
    return a.text === b.text &&
        a.color === b.color &&
        a.opacity === b.opacity &&
        a.size === b.size &&
        a.layout === b.layout &&
        a.position === b.position;
}

export function TemplateProvider({ children }: { children: ReactNode }) {
    const { settings, updateSettings, watermarkType, setWatermarkType } = useApp();
    const [templates, setTemplates] = useState<WatermarkTemplate[]>(readSavedTemplates);
    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [storageError, setStorageError] = useState<string | null>(null);

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
            setStorageError(null);
        } catch {
            setStorageError('Could not save templates in this browser. Check storage permissions or available space.');
        }
    }, [templates]);

    const activeTemplate = useMemo(
        () => templates.find(item => item.id === activeTemplateId),
        [templates, activeTemplateId],
    );
    const isModified = !!activeTemplate && (
        !settingsMatch(activeTemplate.settings, settings) ||
        activeTemplate.watermarkType !== watermarkType
    );

    function applyTemplate(id: string) {
        const template = templates.find(item => item.id === id);
        if (!template) return;
        updateSettings({ ...template.settings });
        setWatermarkType(template.watermarkType);
        setActiveTemplateId(id);
    }

    function saveCurrentAsTemplate(name: string, description = ''): string | null {
        const cleanName = name.trim().slice(0, 60);
        if (!cleanName) return null;
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const template: WatermarkTemplate = {
            id,
            name: cleanName,
            description: description.trim().slice(0, 180),
            settings: { ...settings },
            watermarkType,
            createdAt: now,
            updatedAt: now,
        };
        setTemplates(current => [template, ...current]);
        setActiveTemplateId(id);
        return id;
    }

    function updateActiveTemplate() {
        if (!activeTemplateId) return;
        const now = new Date().toISOString();
        setTemplates(current => current.map(item => item.id === activeTemplateId
            ? { ...item, settings: { ...settings }, watermarkType, updatedAt: now }
            : item,
        ));
    }

    function renameTemplate(id: string, name: string) {
        const cleanName = name.trim().slice(0, 60);
        if (!cleanName) return;
        setTemplates(current => current.map(item => item.id === id
            ? { ...item, name: cleanName, updatedAt: new Date().toISOString() }
            : item,
        ));
    }

    function duplicateTemplate(id: string) {
        const source = templates.find(item => item.id === id);
        if (!source) return;
        const now = new Date().toISOString();
        setTemplates(current => [{
            ...source,
            id: crypto.randomUUID(),
            name: `${source.name.slice(0, 53)} (copy)`,
            settings: { ...source.settings },
            createdAt: now,
            updatedAt: now,
        }, ...current]);
    }

    function deleteTemplate(id: string) {
        setTemplates(current => current.filter(item => item.id !== id));
        setActiveTemplateId(current => current === id ? null : current);
    }

    const value: TemplateContextValue = {
        templates,
        activeTemplate,
        isModified,
        storageError,
        applyTemplate,
        saveCurrentAsTemplate,
        updateActiveTemplate,
        renameTemplate,
        duplicateTemplate,
        deleteTemplate,
        detachTemplate: () => setActiveTemplateId(null),
    };
    return <TemplateContext.Provider value={value}>{children}</TemplateContext.Provider>;
}

export function useTemplates(): TemplateContextValue {
    const value = useContext(TemplateContext);
    if (!value) throw new Error('useTemplates must be used within TemplateProvider');
    return value;
}
