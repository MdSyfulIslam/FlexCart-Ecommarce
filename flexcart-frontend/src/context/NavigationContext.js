import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

export const NavigationContext = createContext();

export const NavigationProvider = ({ children }) => {
    const [activeSection, setActiveSectionInternal] = useState('home');
    const [activeCategory, setActiveCategory] = useState(null);
    const [activeSort, setActiveSort] = useState('newest');
    const [filters, setFiltersInternal] = useState({});
    const [pendingProductId, setPendingProductId] = useState(null);
    const [aiSearchResults, setAiSearchResults] = useState(null);

    // Set the initial browser history entry on first load
    useEffect(() => {
        window.history.replaceState(
            { section: 'home', filters: {}, category: null, sort: 'newest' },
            ''
        );
    }, []);

    // Restore state when user presses browser back/forward
    useEffect(() => {
        const handlePopState = (e) => {
            if (e.state) {
                setActiveSectionInternal(e.state.section || 'home');
                setFiltersInternal(e.state.filters || {});
                setActiveCategory(e.state.category || null);
                setActiveSort(e.state.sort || 'newest');
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Navigate to a section with optional filters — pushes a browser history entry
    const navigate = useCallback((section, newFilters = {}, category = null) => {
        setActiveSectionInternal(section);
        setFiltersInternal(newFilters);
        setActiveCategory(category);
        window.history.pushState(
            { section, filters: newFilters, category, sort: 'newest' },
            ''
        );
    }, []);

    // Navigate to a section, clear any search filters — used by sidebar/logo
    const navigateTo = useCallback((section) => {
        navigate(section, {}, null);
    }, [navigate]);

    // Raw setters (no history push) — used for in-page filter changes like CategoryBar
    const setActiveSection = setActiveSectionInternal;
    const setFilters = setFiltersInternal;

    return (
        <NavigationContext.Provider value={{
            activeSection,
            setActiveSection,
            activeCategory,
            setActiveCategory,
            activeSort,
            setActiveSort,
            filters,
            setFilters,
            navigate,
            navigateTo,
            pendingProductId,
            setPendingProductId,
            aiSearchResults,
            setAiSearchResults
        }}>
            {children}
        </NavigationContext.Provider>
    );
};

export const useNavigation = () => useContext(NavigationContext);
