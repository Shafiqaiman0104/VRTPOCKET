/**
 * VR FINANCE - Single Page Web Application Controller
 * Connects to PocketBase backend with custom table collections.
 */

// Initialize PocketBase
const pbUrl = (
    window.location.hostname === "localhost" && window.location.port === "8090" ||
    window.location.hostname === "127.0.0.1" && window.location.port === "8090"
) ? window.location.origin : "https://pocketbase2.venturerushtech.com";
const pb = new PocketBase(pbUrl);

// Application State
let currentUser = null;
let currentTab = 'dashboard';
let currentDashboardSegment = 'all'; // 'all', 'personal', 'business', 'investments'
let dashboardDateFilterType = 'all'; // 'all', 'month', 'custom'
let dashboardDateMonth = '';         // e.g. '2026-07'
let dashboardDateFrom = '';          // e.g. '2026-07-01'
let dashboardDateTo = '';            // e.g. '2026-07-31'
let charts = {};
let currentAutofillContext = '';
let currentZoom = parseFloat(localStorage.getItem('vrtpocket_zoom')) || 1.0;

// Signup wizard state
let signupCurrentStep = 1;
let signupHasCompany = true;

// Cache for dashboard data
let appData = {
    personalIncome: [],
    personalExpenses: [],
    businessIncome: [],
    businessExpenses: [],
    investments: [],
    investmentExpenses: [],
    invoices: []
};

// ==================== DOM ELEMENTS & INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    
    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('ServiceWorker registration successful with scope: ', reg.scope))
                .catch(err => console.log('ServiceWorker registration failed: ', err));
        });
    }
});

// Helper to update brand logo images based on theme
function updateAppLogos(isLight) {
    const logoSrc = isLight ? 'vrLogoBlue.png' : 'vrLogoWhite.png';
    const authLogo = document.getElementById('app-logo-auth');
    const sidebarLogo = document.getElementById('app-logo-sidebar');
    if (authLogo) authLogo.src = logoSrc;
    if (sidebarLogo) sidebarLogo.src = logoSrc;
}

// Helper to format Date string to DD/MM/YYYY
function formatDateToDMY(dateStr) {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    // If it's a Date object
    if (dateStr instanceof Date) {
        const day = String(dateStr.getDate()).padStart(2, '0');
        const month = String(dateStr.getMonth() + 1).padStart(2, '0');
        const year = dateStr.getFullYear();
        return `${day}/${month}/${year}`;
    }
    const cleanStr = dateStr.split(' ')[0].split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Check if a date string falls inside the active dashboard date filters
function isDateInFilter(dateStr) {
    if (!dateStr) return false;
    // Strip timestamps to avoid offset issues
    const date = new Date(dateStr);
    
    if (dashboardDateFilterType === 'all') {
        return true;
    }
    
    if (dashboardDateFilterType === 'month') {
        if (!dashboardDateMonth) return true;
        const [year, month] = dashboardDateMonth.split('-');
        const filterYear = parseInt(year, 10);
        const filterMonth = parseInt(month, 10) - 1;
        return date.getFullYear() === filterYear && date.getMonth() === filterMonth;
    }
    
    if (dashboardDateFilterType === 'custom') {
        if (dashboardDateFrom) {
            const fromDate = new Date(dashboardDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (date < fromDate) return false;
        }
        if (dashboardDateTo) {
            const toDate = new Date(dashboardDateTo);
            toDate.setHours(23, 59, 59, 999);
            if (date > toDate) return false;
        }
        return true;
    }
    return true;
}

// Convert month picker string (e.g. '2026-07') to friendly label ('July 2026')
function formatMonthYearLabel(monthStr) {
    if (!monthStr) return 'Select Month';
    const [year, month] = monthStr.split('-');
    const monthNames = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
    ];
    const mIdx = parseInt(month, 10) - 1;
    return `${monthNames[mIdx]} ${year}`;
}

// Initialize Application state and check auth
function applyZoom(zoomVal) {
    currentZoom = Math.max(0.7, Math.min(1.8, zoomVal)); // bounds: 70% to 180%
    localStorage.setItem('vrtpocket_zoom', currentZoom);
    
    // Apply zoom to document body
    document.body.style.zoom = currentZoom;
    
    // Update display text
    const zoomText = document.getElementById('zoom-percentage-val');
    if (zoomText) {
        zoomText.textContent = `${Math.round(currentZoom * 100)}%`;
    }
}

async function initApp() {
    // Apply stored zoom scale
    applyZoom(currentZoom);

    // Theme toggle initialization (defaults to light mode on first visit)
    const savedTheme = localStorage.getItem('theme');
    const isLight = savedTheme === null || savedTheme === 'light';
    
    if (isLight) {
        document.body.setAttribute('data-theme', 'light');
        document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-sun"></i>';
        updateAppLogos(true);
    } else {
        document.body.removeAttribute('data-theme');
        document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-moon"></i>';
        updateAppLogos(false);
    }

    // Check PocketBase authorization status
    if (pb.authStore.isValid && pb.authStore.model) {
        // Double check model type to verify it's our auth collection
        currentUser = pb.authStore.model;
        applyCompanyRestrictions(currentUser);
        showDashboard();
    } else {
        showAuthScreen();
    }
}

// ==================== TOAST NOTIFICATION CONTROLLER ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Close button handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    // Auto remove after 5s
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

// Global Loading Overlay togglers
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
}

// ==================== SCREEN SWITCHERS ====================
function showAuthScreen() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('main-container').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');
    
    // Apply Restrictions
    applyCompanyRestrictions(currentUser);
    
    // Set Header Info
    updateUserHeaderDisplay();
    
    // Route to dashboard initially or active hash
    const currentHash = window.location.hash ? window.location.hash.substring(1) + '-tab' : 'dashboard-tab';
    const activeLink = document.querySelector(`.nav-link[data-tab="${currentHash}"]`);
    if (activeLink && !activeLink.classList.contains('disabled')) {
        switchTab(currentHash);
    } else {
        switchTab('dashboard-tab');
    }
    
    // Sync entire data from PocketBase
    syncAllData();
}

function updateUserHeaderDisplay() {
    if (!currentUser) return;
    
    const hasCompany = !!currentUser.has_company;
    
    // 1. Update Personal Badge
    const personalName = currentUser.name || 'Personal User';
    const personalEmail = currentUser.personal_email || currentUser.email || '';
    document.getElementById('header-personal-name').textContent = personalName;
    document.getElementById('header-personal-email').textContent = personalEmail;
    
    const personalAvatarImg = document.getElementById('header-personal-avatar');
    if (personalAvatarImg) {
        if (currentUser.profile_picture) {
            personalAvatarImg.src = pb.files.getUrl(currentUser, currentUser.profile_picture);
        } else {
            personalAvatarImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
        }
    }
    
    // 2. Update Company Badge & Toggle Visibility
    const companyBadge = document.getElementById('sidebar-company-badge');
    if (companyBadge) {
        if (hasCompany) {
            companyBadge.classList.remove('hidden');
            
            const companyName = currentUser.company_name || 'My Organization';
            const companyEmail = currentUser.company_email || currentUser.email || '';
            document.getElementById('header-company-name').textContent = companyName;
            document.getElementById('header-company-email').textContent = companyEmail;
            
            const companyLogoImg = document.getElementById('header-company-logo');
            if (companyLogoImg) {
                if (currentUser.company_logo) {
                    companyLogoImg.src = pb.files.getUrl(currentUser, currentUser.company_logo);
                } else {
                    companyLogoImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 2L2 22h20L12 2z'/%3E%3C/svg%3E";
                }
            }
        } else {
            companyBadge.classList.add('hidden');
        }
    }
    
    // Welcome message showing personal name or company name
    const welcomeName = currentUser.name || currentUser.company_name || 'User';
    document.getElementById('dashboard-welcome-name').textContent = welcomeName;
    
    // Currency indicator
    const currencyStr = currentUser.currency || 'USD';
    document.querySelector('.currency-indicator').innerHTML = `<i class="fa-solid fa-coins"></i> ${currencyStr}`;
}

// ==================== ROUTING SYSTEM ====================
function switchTab(tabId) {
    // Update menu highlight
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-tab') === tabId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Toggle content panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
    
    // Toggle segment selector visibility
    const segSelector = document.getElementById('dashboard-segment-selector');
    if (tabId === 'dashboard-tab') {
        if (segSelector) segSelector.classList.remove('hidden');
        const titleMap = {
            'all': 'Financial Dashboard',
            'personal': 'Personal Dashboard',
            'business': 'Business Dashboard',
            'investments': 'Investments Dashboard'
        };
        document.getElementById('page-title').textContent = titleMap[currentDashboardSegment] || 'Financial Dashboard';
    } else {
        if (segSelector) segSelector.classList.add('hidden');
        // Update Page Header Title
        const titleMap = {
            'personal-tab': 'Personal Wealth Index',
            'business-tab': 'Business Cashflow Management',
            'investments-tab': 'Investments Portfolio',
            'invoices-tab': 'Corporate Invoices Suite',
            'reports-tab': 'Financial Reports Intelligence',
            'profile-tab': 'System Settings',
            'display-tab': 'Display Settings'
        };
        document.getElementById('page-title').textContent = titleMap[tabId] || 'Financial Hub';
    }
    
    currentTab = tabId.replace('-tab', '');
    window.location.hash = currentTab;
    
    // Recalculate and draw components if switching to dashboard or reports
    if (currentTab === 'dashboard') {
        renderDashboardStats();
    } else if (currentTab === 'reports') {
        compileReport(new Event('submit'));
    }
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
    // Hash Change listener for back/forward browser support
    window.addEventListener('hashchange', () => {
        if (pb.authStore.isValid && window.location.hash) {
            const targetTab = window.location.hash.substring(1) + '-tab';
            const navLink = document.querySelector(`.nav-link[data-tab="${targetTab}"]`);
            if (navLink) switchTab(targetTab);
        }
    });

    // Tab buttons handler
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Segment dropdown selector click
    const dashSegBtn = document.getElementById('dashboard-segment-btn');
    const dashSegMenu = document.getElementById('dashboard-segment-menu');
    
    if (dashSegBtn && dashSegMenu) {
        dashSegBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dashSegMenu.classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!dashSegMenu.contains(e.target) && e.target !== dashSegBtn) {
                dashSegMenu.classList.add('hidden');
            }
        });
    }

    // Segment menu items selection
    document.querySelectorAll('.segment-menu-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const segment = btn.getAttribute('data-segment');
            currentDashboardSegment = segment;
            
            // Toggle active menu item
            document.querySelectorAll('.segment-menu-item').forEach(item => {
                item.classList.remove('active');
            });
            btn.classList.add('active');
            
            // Hide menu
            dashSegMenu.classList.add('hidden');

            // Update page title
            const titleMap = {
                'all': 'Financial Dashboard',
                'personal': 'Personal Dashboard',
                'business': 'Business Dashboard',
                'investments': 'Investments Dashboard'
            };
            document.getElementById('page-title').textContent = titleMap[segment];

            // Refresh view
            renderDashboardStats();
        });
    });

    // Auth screen form toggles
    document.getElementById('toggle-to-signup').addEventListener('click', () => {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('signup-form').classList.remove('hidden');
        document.querySelector('.auth-subtitle').textContent = 'Create Account';
        // Reset wizard step
        showSignupStep(1);
        signupHasCompany = true;
    });

    document.getElementById('toggle-to-login').addEventListener('click', () => {
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.querySelector('.auth-subtitle').textContent = 'Wealth Managment Portal';
    });

    // Signup wizard stepper button clicks
    document.getElementById('btn-signup-next-1').onclick = () => {
        if (validateStepInputs('wizard-step-1')) {
            const password = document.getElementById('signup-password').value;
            const passwordConfirm = document.getElementById('signup-password-confirm').value;
            if (password.length < 8) {
                showToast('Password must be at least 8 characters long.', 'warning');
                return;
            }
            if (password !== passwordConfirm) {
                showToast('Passwords do not match.', 'error');
                return;
            }
            showSignupStep(2);
        }
    };

    // Autofill Personal Email with Login Email
    const useSameEmailBtn = document.getElementById('signup-use-same-email');
    if (useSameEmailBtn) {
        useSameEmailBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const loginEmail = document.getElementById('signup-email').value;
            document.getElementById('signup-personal-email').value = loginEmail;
            showToast('Email address copied!', 'success');
        };
    }

    // Autofill Company Email with Login Email
    const useSameEmailCompanyBtn = document.getElementById('signup-use-same-email-company');
    if (useSameEmailCompanyBtn) {
        useSameEmailCompanyBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const loginEmail = document.getElementById('signup-email').value;
            document.getElementById('signup-company-email').value = loginEmail;
            showToast('Company email copied!', 'success');
        };
    }

    document.getElementById('btn-signup-prev-2').onclick = () => {
        showSignupStep(1);
    };

    document.getElementById('btn-signup-skip-2').onclick = () => {
        signupHasCompany = false;
        // Clear fields
        document.getElementById('signup-company-name').value = '';
        document.getElementById('signup-company-email').value = '';
        document.getElementById('signup-company-phone').value = '';
        document.getElementById('signup-company-address').value = '';
        document.getElementById('signup-company-logo').value = '';
        document.getElementById('signup-company-logo-preview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 2L2 22h20L12 2z'/%3E%3C/svg%3E";
        showSignupStep(3);
    };

    document.getElementById('btn-signup-next-2').onclick = () => {
        const cName = document.getElementById('signup-company-name').value.trim();
        const cEmail = document.getElementById('signup-company-email').value.trim();
        const cPhone = document.getElementById('signup-company-phone').value.trim();
        const cAddress = document.getElementById('signup-company-address').value.trim();

        if (!cName || !cEmail || !cPhone || !cAddress) {
            showToast('Please fill up all company details or click "Skip Company" to register as a personal user.', 'warning');
            return;
        }
        signupHasCompany = true;
        showSignupStep(3);
    };

    document.getElementById('btn-signup-prev-3').onclick = () => {
        showSignupStep(2);
    };

    // Signup avatar preview
    const signupAvatarInput = document.getElementById('signup-profile-picture');
    if (signupAvatarInput) {
        signupAvatarInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('signup-avatar-preview').src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // Signup company logo preview
    const signupLogoInput = document.getElementById('signup-company-logo');
    if (signupLogoInput) {
        signupLogoInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('signup-company-logo-preview').src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // Dashboard Date Filter Handlers
    const dateFilterTypeSelect = document.getElementById('dashboard-date-filter-type');
    const selectedMonthDisplay = document.getElementById('dashboard-selected-month-display');
    const customDateWrapper = document.getElementById('dashboard-custom-date-wrapper');
    
    // Store previous working values
    let prevFilterType = 'all';

    if (dateFilterTypeSelect) {
        dateFilterTypeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'all') {
                dashboardDateFilterType = 'all';
                prevFilterType = 'all';
                selectedMonthDisplay.classList.add('hidden');
                customDateWrapper.classList.add('hidden');
                renderDashboardStats();
            } else if (val === 'month') {
                openModal('dashboard-month-modal');
            } else if (val === 'custom') {
                dashboardDateFilterType = 'custom';
                prevFilterType = 'custom';
                selectedMonthDisplay.classList.add('hidden');
                customDateWrapper.classList.remove('hidden');
                renderDashboardStats();
            }
        });
    }

    const closeMonthModal = () => {
        closeModal('dashboard-month-modal');
        if (dateFilterTypeSelect) {
            dateFilterTypeSelect.value = dashboardDateFilterType;
        }
    };

    document.getElementById('close-dashboard-month-modal').onclick = closeMonthModal;
    document.getElementById('btn-cancel-dashboard-month').onclick = closeMonthModal;

    document.getElementById('btn-apply-dashboard-month').onclick = () => {
        const monthVal = document.getElementById('dashboard-month-picker').value;
        if (!monthVal) {
            showToast('Please select a valid month and year.', 'warning');
            return;
        }
        dashboardDateMonth = monthVal;
        dashboardDateFilterType = 'month';
        prevFilterType = 'month';

        document.getElementById('month-filter-label').textContent = formatMonthYearLabel(monthVal);
        selectedMonthDisplay.classList.remove('hidden');
        customDateWrapper.classList.add('hidden');

        closeModal('dashboard-month-modal');
        renderDashboardStats();
    };

    document.getElementById('btn-change-month-filter').onclick = () => {
        openModal('dashboard-month-modal');
    };

    const dateFromInput = document.getElementById('dashboard-date-from');
    const dateToInput = document.getElementById('dashboard-date-to');
    if (dateFromInput && dateToInput) {
        const onCustomDateChange = () => {
            dashboardDateFrom = dateFromInput.value;
            dashboardDateTo = dateToInput.value;
            renderDashboardStats();
        };
        dateFromInput.addEventListener('change', onCustomDateChange);
        dateToInput.addEventListener('change', onCustomDateChange);
    }

    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const isLight = document.body.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-moon"></i>';
            updateAppLogos(false);
        } else {
            document.body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-sun"></i>';
            updateAppLogos(true);
        }
        // Force refresh charts to look good in the new background mode
        if (currentTab === 'dashboard') {
            renderDashboardCharts();
        }
    });

    // Disconnect (Logout)
    document.getElementById('logout-btn').addEventListener('click', () => {
        pb.authStore.clear();
        currentUser = null;
        showToast('Logged out successfully.', 'info');
        showAuthScreen();
    });

    // --- DISPLAY SETTINGS ---
    // Fullscreen Mode Toggle
    const fullscreenToggle = document.getElementById('display-fullscreen-toggle');
    if (fullscreenToggle) {
        // Sync toggled state if user enters/exits fullscreen natively (e.g. Esc key)
        document.addEventListener('fullscreenchange', () => {
            fullscreenToggle.checked = !!document.fullscreenElement;
        });

        fullscreenToggle.addEventListener('change', () => {
            if (fullscreenToggle.checked) {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => {
                        console.error(`Error attempting to enable fullscreen: ${err.message}`);
                        fullscreenToggle.checked = false;
                        showToast('Fullscreen mode failed to launch.', 'error');
                    });
                }
            } else {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
            }
        });
    }

    // Zoom Controls
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    
    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            applyZoom(currentZoom + 0.1);
        });
    }
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            applyZoom(currentZoom - 0.1);
        });
    }
    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
            applyZoom(1.0);
        });
    }

    // --- FETCH PREVIOUS INVOICE ---
    const fetchPrevInvoiceBtn = document.getElementById('btn-invoice-fetch-prev');
    if (fetchPrevInvoiceBtn) {
        fetchPrevInvoiceBtn.addEventListener('click', openInvoiceFetchModal);
    }

    const closeInvoiceFetchBtn = document.getElementById('close-invoice-fetch-modal');
    if (closeInvoiceFetchBtn) {
        closeInvoiceFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-fetch-modal').classList.add('hidden');
        });
    }

    const cancelInvoiceFetchBtn = document.getElementById('btn-close-invoice-fetch-form');
    if (cancelInvoiceFetchBtn) {
        cancelInvoiceFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-fetch-modal').classList.add('hidden');
        });
    }

    const invoiceSearchInput = document.getElementById('invoice-fetch-search-input');
    if (invoiceSearchInput) {
        invoiceSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const filtered = appData.invoices.filter(inv => {
                const clientMatch = inv.client_name ? inv.client_name.toLowerCase().includes(term) : false;
                const numberMatch = inv.invoice_number ? inv.invoice_number.toLowerCase().includes(term) : false;
                return clientMatch || numberMatch;
            });
            renderFetchInvoiceList(filtered);
        });
    }

    // --- QUICK PREVIEW MODAL ---
    const closePreviewPopupBtn = document.getElementById('close-invoice-preview-popup-modal');
    if (closePreviewPopupBtn) {
        closePreviewPopupBtn.addEventListener('click', () => {
            document.getElementById('invoice-preview-popup-modal').classList.add('hidden');
        });
    }

    const closePreviewPopupBtn2 = document.getElementById('btn-close-invoice-preview-popup-modal');
    if (closePreviewPopupBtn2) {
        closePreviewPopupBtn2.addEventListener('click', () => {
            document.getElementById('invoice-preview-popup-modal').classList.add('hidden');
        });
    }

    const selectFromPreviewBtn = document.getElementById('btn-select-invoice-from-preview-popup');
    if (selectFromPreviewBtn) {
        selectFromPreviewBtn.addEventListener('click', () => {
            if (currentPreviewInvoiceId) {
                autofillInvoiceFromTemplate(currentPreviewInvoiceId);
                document.getElementById('invoice-preview-popup-modal').classList.add('hidden');
            }
        });
    }

    // --- FETCH CLIENT DATA ---
    const fetchClientBtn = document.getElementById('btn-invoice-fetch-client');
    if (fetchClientBtn) {
        fetchClientBtn.addEventListener('click', openInvoiceClientFetchModal);
    }

    const closeInvoiceClientFetchBtn = document.getElementById('close-invoice-client-fetch-modal');
    if (closeInvoiceClientFetchBtn) {
        closeInvoiceClientFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-client-fetch-modal').classList.add('hidden');
        });
    }

    const cancelInvoiceClientFetchBtn = document.getElementById('btn-close-invoice-client-fetch-form');
    if (cancelInvoiceClientFetchBtn) {
        cancelInvoiceClientFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-client-fetch-modal').classList.add('hidden');
        });
    }

    const clientSearchInput = document.getElementById('invoice-client-search-input');
    if (clientSearchInput) {
        clientSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const allClients = getDeduplicatedClients();
            const filtered = allClients.filter(c => {
                const nameMatch = c.name ? c.name.toLowerCase().includes(term) : false;
                const emailMatch = c.email ? c.email.toLowerCase().includes(term) : false;
                const addrMatch = c.address ? c.address.toLowerCase().includes(term) : false;
                return nameMatch || emailMatch || addrMatch;
            });
            renderFetchClientList(filtered);
        });
    }

    // --- FORM SUBMISSIONS ---
    
    // Login Submission
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        showLoading(true);
        try {
            const authData = await pb.collection('VRTPOCKET_LOGIN_DATABASE').authWithPassword(email, password);
            currentUser = authData.record;
            showToast('Authorization successful!', 'success');
            showDashboard();
        } catch (error) {
            console.error(error);
            showToast('Sign in failed. Check credentials or verify pocketbase is running.', 'error');
        } finally {
            showLoading(false);
        }
    });

    // Signup Submission
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const passwordConfirm = document.getElementById('signup-password-confirm').value;
        
        if (password !== passwordConfirm) {
            showToast('Passwords do not match.', 'error');
            return;
        }

        const name = document.getElementById('signup-name').value;
        const personalEmail = document.getElementById('signup-personal-email').value;
        const personalPhone = document.getElementById('signup-personal-phone').value;
        const profilePictureFile = document.getElementById('signup-profile-picture').files[0];
        
        const currency = document.getElementById('signup-currency').value;

        showLoading(true);
        
        // Multi-part Form Data for upload support
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);
        formData.append('passwordConfirm', passwordConfirm);
        
        // Personal details
        formData.append('name', name);
        formData.append('personal_email', personalEmail);
        formData.append('personal_phone', personalPhone);
        formData.append('has_company', signupHasCompany);
        formData.append('currency', currency);
        
        if (profilePictureFile) {
            formData.append('profile_picture', profilePictureFile);
        }

        // Company Details (only if not skipped)
        if (signupHasCompany) {
            const companyName = document.getElementById('signup-company-name').value || 'My Corporation';
            const companyEmail = document.getElementById('signup-company-email').value;
            const companyPhone = document.getElementById('signup-company-phone').value;
            const companyAddress = document.getElementById('signup-company-address').value;
            const logoFile = document.getElementById('signup-company-logo').files[0];

            formData.append('company_name', companyName);
            formData.append('company_email', companyEmail);
            formData.append('company_phone', companyPhone);
            formData.append('company_address', companyAddress);
            if (logoFile) {
                formData.append('company_logo', logoFile);
            }
        } else {
            formData.append('company_name', '');
            formData.append('company_email', '');
            formData.append('company_phone', '');
            formData.append('company_address', '');
        }

        try {
            // Create user
            await pb.collection('VRTPOCKET_LOGIN_DATABASE').create(formData);
            
            // Login user immediately
            const authData = await pb.collection('VRTPOCKET_LOGIN_DATABASE').authWithPassword(email, password);
            currentUser = authData.record;
            showToast('Account initialized successfully!', 'success');
            
            // Clear inputs and reset wizard state
            document.getElementById('signup-form').reset();
            showSignupStep(1);
            signupHasCompany = true;
            
            showDashboard();
        } catch (error) {
            console.error(error);
            showToast('Signup failed. Make sure collection schema matches plan instructions.', 'error');
        } finally {
            showLoading(false);
        }
    });

    // Modal forms discards
    document.getElementById('close-p-income-modal').onclick = () => closeModal('personal-income-modal');
    document.getElementById('btn-close-p-income-form').onclick = () => closeModal('personal-income-modal');
    
    document.getElementById('close-p-expense-modal').onclick = () => closeModal('personal-expense-modal');
    document.getElementById('btn-close-p-expense-form').onclick = () => closeModal('personal-expense-modal');
    
    document.getElementById('close-b-income-modal').onclick = () => closeModal('business-income-modal');
    document.getElementById('btn-close-b-income-form').onclick = () => closeModal('business-income-modal');
    
    document.getElementById('close-b-expense-modal').onclick = () => closeModal('business-expense-modal');
    document.getElementById('btn-close-b-expense-form').onclick = () => closeModal('business-expense-modal');

    document.getElementById('close-investment-modal').onclick = () => closeModal('investment-modal');
    document.getElementById('btn-close-investment-form').onclick = () => closeModal('investment-modal');
    
    document.getElementById('close-investment-expense-modal').onclick = () => closeModal('investment-expense-modal');
    document.getElementById('btn-close-investment-expense-form').onclick = () => closeModal('investment-expense-modal');

    // Add buttons toggles
    document.getElementById('btn-add-p-income').onclick = () => {
        document.getElementById('personal-income-form').reset();
        document.getElementById('personal-income-id').value = '';
        document.getElementById('personal-income-modal-title').textContent = 'Log Personal Income';
        document.getElementById('personal-income-currency-label').value = currentUser.currency || 'USD';
        openModal('personal-income-modal');
    };

    document.getElementById('btn-add-p-expense').onclick = () => {
        document.getElementById('personal-expense-form').reset();
        document.getElementById('personal-expense-id').value = '';
        document.getElementById('personal-expense-modal-title').textContent = 'Log Personal Expense';
        document.getElementById('personal-expense-subscription-sub-settings').classList.add('hidden');
        document.getElementById('personal-expense-sub-status').value = 'subscribe';
        updateSubscriptionStatusUI('personal-expense');
        openModal('personal-expense-modal');
    };

    document.getElementById('btn-add-b-income').onclick = () => {
        document.getElementById('business-income-form').reset();
        document.getElementById('business-income-id').value = '';
        document.getElementById('business-income-modal-title').textContent = 'Log Business Revenue';
        openModal('business-income-modal');
    };

    document.getElementById('btn-add-b-expense').onclick = () => {
        document.getElementById('business-expense-form').reset();
        document.getElementById('business-expense-id').value = '';
        document.getElementById('business-expense-modal-title').textContent = 'Log Business Expense';
        document.getElementById('business-expense-subscription-sub-settings').classList.add('hidden');
        document.getElementById('business-expense-sub-status').value = 'subscribe';
        updateSubscriptionStatusUI('business-expense');
        openModal('business-expense-modal');
    };

    document.getElementById('btn-add-investment').onclick = () => {
        document.getElementById('investment-form').reset();
        document.getElementById('investment-id').value = '';
        document.getElementById('investment-modal-title').textContent = 'Log Investment Asset';
        openModal('investment-modal');
    };

    document.getElementById('btn-add-investment-expense-direct').onclick = () => {
        openAddFeeModal(null, null);
    };

    // Database CRUD Form submissions
    document.getElementById('personal-income-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_PERSONAL_FINANCE_DATABASE', 'personal-income-form', 'personal-income-modal');
    document.getElementById('personal-expense-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE', 'personal-expense-form', 'personal-expense-modal');
    document.getElementById('business-income-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_BUSINESS_FINANCE_DATABASE', 'business-income-form', 'business-income-modal');
    document.getElementById('business-expense-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE', 'business-expense-form', 'business-expense-modal');
    document.getElementById('investment-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE', 'investment-form', 'investment-modal');
    document.getElementById('investment-expense-form').onsubmit = (e) => saveInvestmentFeeRecord(e);

    // Autofill Trigger click handlers
    document.getElementById('btn-fetch-personal-income').onclick = () => openAutofill('personal-income');
    document.getElementById('btn-fetch-personal-expense').onclick = () => openAutofill('personal-expense');
    document.getElementById('btn-fetch-business-income').onclick = () => openAutofill('business-income');
    document.getElementById('btn-fetch-business-expense').onclick = () => openAutofill('business-expense');

    document.getElementById('close-autofill-modal').onclick = () => closeModal('autofill-modal');
    document.getElementById('btn-autofill-back-to-frequency').onclick = () => {
        document.getElementById('autofill-frequency-selector').classList.remove('hidden');
        document.getElementById('autofill-list-wrapper').classList.add('hidden');
    };

    document.getElementById('btn-autofill-monthly').onclick = () => showAutofillTemplates('monthly');
    document.getElementById('btn-autofill-yearly').onclick = () => showAutofillTemplates('yearly');

    // Subscription controls event listeners
    document.getElementById('personal-expense-is-subscription').onchange = (e) => {
        const wrapper = document.getElementById('personal-expense-subscription-sub-settings');
        if (e.target.checked) {
            wrapper.classList.remove('hidden');
            document.getElementById('personal-expense-sub-status').value = 'subscribe';
            updateSubscriptionStatusUI('personal-expense');
        } else {
            wrapper.classList.add('hidden');
        }
    };
    document.getElementById('business-expense-is-subscription').onchange = (e) => {
        const wrapper = document.getElementById('business-expense-subscription-sub-settings');
        if (e.target.checked) {
            wrapper.classList.remove('hidden');
            document.getElementById('business-expense-sub-status').value = 'subscribe';
            updateSubscriptionStatusUI('business-expense');
        } else {
            wrapper.classList.add('hidden');
        }
    };
    document.getElementById('personal-expense-sub-status').onchange = () => {
        updateSubscriptionStatusUI('personal-expense');
    };
    document.getElementById('business-expense-sub-status').onchange = () => {
        updateSubscriptionStatusUI('business-expense');
    };

    // Profile Settings Form
    document.getElementById('profile-form').onsubmit = async (e) => {
        e.preventDefault();
        showLoading(true);
        
        const personalName = document.getElementById('profile-personal-name').value;
        const personalEmail = document.getElementById('profile-personal-email').value;
        const personalPhone = document.getElementById('profile-personal-phone').value;
        const currency = document.getElementById('profile-currency').value;
        const avatarFile = document.getElementById('profile-avatar-input').files[0];
        
        const hasCompany = document.getElementById('profile-company-toggle').checked;

        const formData = new FormData();
        formData.append('name', personalName);
        formData.append('personal_email', personalEmail);
        formData.append('personal_phone', personalPhone);
        formData.append('currency', currency);
        formData.append('has_company', hasCompany);

        if (avatarFile) {
            formData.append('profile_picture', avatarFile);
        }

        if (hasCompany) {
            const companyName = document.getElementById('profile-company-name').value;
            const companyEmail = document.getElementById('profile-company-email').value;
            const companyPhone = document.getElementById('profile-company-phone').value;
            const companyAddress = document.getElementById('profile-company-address').value;
            const bankDetails = document.getElementById('profile-bank-details').value;
            const invoiceNotesTerms = document.getElementById('profile-invoice-notes-terms').value;
            const logoFile = document.getElementById('profile-logo-input').files[0];

            formData.append('company_name', companyName);
            formData.append('company_email', companyEmail);
            formData.append('company_phone', companyPhone);
            formData.append('company_address', companyAddress);
            formData.append('bank_details', bankDetails);
            formData.append('invoice_notes_terms', invoiceNotesTerms);

            if (logoFile) {
                formData.append('company_logo', logoFile);
            }
        } else {
            formData.append('company_name', '');
            formData.append('company_email', '');
            formData.append('company_phone', '');
            formData.append('company_address', '');
            formData.append('bank_details', '');
            formData.append('invoice_notes_terms', '');
            formData.append('company_logo', '');
        }

        try {
            const updated = await pb.collection('VRTPOCKET_LOGIN_DATABASE').update(currentUser.id, formData);
            currentUser = updated;
            
            // Clear all business records if company features are disabled
            if (!hasCompany) {
                try {
                    await clearAllBusinessData(currentUser.id);
                } catch (cleanErr) {
                    console.error("Failed to clean up business data:", cleanErr);
                }
            }
            
            showToast('System settings updated!', 'success');
            applyCompanyRestrictions(currentUser);
            updateUserHeaderDisplay();
            syncAllData();
        } catch (error) {
            console.error(error);
            showToast('Failed to update settings. Verify connection details.', 'error');
        } finally {
            showLoading(false);
        }
    };

    // Profile company toggle change
    const companyToggle = document.getElementById('profile-company-toggle');
    if (companyToggle) {
        companyToggle.onchange = (e) => {
            if (!e.target.checked) {
                const confirmed = confirm("are you sure want to disable this feature ? this action will remove all the company data");
                if (!confirmed) {
                    // Re-check and abort
                    e.target.checked = true;
                    return;
                }
            }
            
            const container = document.getElementById('profile-company-details-container');
            if (container) {
                container.classList.toggle('hidden', !e.target.checked);
            }
            const toggleFields = ['profile-company-name', 'profile-company-email', 'profile-company-phone', 'profile-company-address'];
            toggleFields.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.required = e.target.checked;
                }
            });
        };
    }

    // Profile avatar input triggers preview
    const profileAvatarInput = document.getElementById('profile-avatar-input');
    if (profileAvatarInput) {
        profileAvatarInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('profile-avatar-preview').src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // Profile logo input triggers preview
    document.getElementById('profile-logo-input').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('profile-logo-preview').src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    // Dynamic Invoice Item Row setup
    document.getElementById('btn-create-invoice').onclick = () => openInvoiceCreator();
    document.getElementById('add-invoice-item-row').onclick = () => addInvoiceItemRow();
    document.getElementById('btn-invoice-cancel').onclick = () => closeInvoiceCreator();
    document.getElementById('btn-invoice-back').onclick = () => closeInvoiceCreator();
    document.getElementById('btn-invoice-close-view').onclick = () => closeInvoiceViewer();
    document.getElementById('btn-invoice-print').onclick = () => window.print();
    document.getElementById('invoice-form').onsubmit = (e) => saveInvoiceRecord(e);
    
    // Dynamic recalculations when typing inside invoice form
    document.getElementById('invoice-tax').oninput = calculateInvoiceTotals;
    document.getElementById('invoice-discount').oninput = calculateInvoiceTotals;

    // Reports trigger
    document.getElementById('report-filter-form').onsubmit = compileReport;
    document.getElementById('btn-print-report').onclick = () => window.print();

    // Mobile Navigation Drawer toggles
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    const openMenu = () => {
        sidebar.classList.add('open');
        overlay.classList.remove('hidden');
    };
    
    const closeMenu = () => {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
    };
    
    document.getElementById('menu-toggle-btn').onclick = openMenu;
    document.getElementById('sidebar-close-btn').onclick = closeMenu;
    overlay.onclick = closeMenu;
    
    // Auto-close menu when clicking nav links on mobile
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });
}

// ==================== WINDOW MODAL MANAGERS ====================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Helper to format values as selected currency
function formatVal(amount) {
    const currencyStr = currentUser ? currentUser.currency : 'USD';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyStr
    }).format(amount);
}

// Helper to calculate subscription due dates relative to today
function calculateNextRenewal(startDateStr, frequency, unsubscribeDateStr) {
    if (unsubscribeDateStr) {
        return new Date(unsubscribeDateStr);
    }
    const start = new Date(startDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (frequency === 'one-time') return start;
    
    let nextDue = new Date(start);
    // Move forward by intervals until it is in the future
    while (nextDue < today) {
        if (frequency === 'monthly') {
            nextDue.setMonth(nextDue.getMonth() + 1);
        } else if (frequency === 'yearly') {
            nextDue.setFullYear(nextDue.getFullYear() + 1);
        } else {
            break;
        }
    }
    return nextDue;
}

// Helper to check if a collection exists by sending a test fetch
async function verifyCollectionExists(collectionName) {
    try {
        await pb.collection(collectionName).getList(1, 1);
        return true;
    } catch (e) {
        console.error(`Collection ${collectionName} check failed:`, e);
        return false;
    }
}

// ==================== CORE SYNCHRONIZER ====================
async function syncAllData() {
    if (!currentUser) return;
    
    showLoading(true);
    try {
        // Refresh local auth state to get latest database properties
        try {
            await pb.collection('VRTPOCKET_LOGIN_DATABASE').authRefresh();
            currentUser = pb.authStore.model;
        } catch (authErr) {
            console.error("Auth refresh failed:", authErr);
        }
        
        applyCompanyRestrictions(currentUser);
        
        const userId = currentUser.id;
        
        // Parallel queries to PocketBase database with user filters
        const [pInc, pExp, bInc, bExp, invs, invoices] = await Promise.all([
            pb.collection('VRTPOCKET_PERSONAL_FINANCE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_PERSONAL_EXPENSES_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_BUSINESS_FINANCE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_BUSINESS_EXPENSES_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_INVESTMENT_FINANCE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-purchase_date' }).catch(() => []),
            pb.collection('VRTPOCKET_INVOICE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-issue_date' }).catch(() => [])
        ]);

        // Get Investment expenses linked to user investments
        let invFees = [];
        if (invs.length > 0) {
            // Relational filters in pocketbase: investment.user = userId
            invFees = await pb.collection('VRTPOCKET_INVESTMENT_EXPENSES_DATABASE').getFullList({
                filter: `investment.user = "${userId}"`,
                sort: '-date'
            }).catch(() => []);
        }

        // Store globally in state
        appData.personalIncome = pInc;
        appData.personalExpenses = pExp;
        appData.businessIncome = bInc;
        appData.businessExpenses = bExp;
        appData.investments = invs;
        appData.investmentExpenses = invFees;
        appData.invoices = invoices;

        // Render sections
        renderPersonalFinance();
        renderBusinessFinance();
        renderInvestments();
        renderInvoices();
        renderDashboardStats();
        
        // Sync profile fields if profile tab active
        syncProfileFields();

    } catch (err) {
        console.error(err);
        showToast('Database synchronization error. Verify pocketbase columns.', 'error');
    } finally {
        showLoading(false);
    }
}

// Sync profile settings values to profile fields
function syncProfileFields() {
    if (!currentUser) return;
    
    // Personal details
    document.getElementById('profile-personal-name').value = currentUser.name || '';
    document.getElementById('profile-personal-email').value = currentUser.personal_email || '';
    document.getElementById('profile-personal-phone').value = currentUser.personal_phone || '';
    document.getElementById('profile-currency').value = currentUser.currency || 'USD';
    
    if (currentUser.profile_picture) {
        document.getElementById('profile-avatar-preview').src = pb.files.getUrl(currentUser, currentUser.profile_picture);
    } else {
        document.getElementById('profile-avatar-preview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    }

    // Company toggle state
    const hasCompany = !!currentUser.has_company;
    const toggle = document.getElementById('profile-company-toggle');
    const container = document.getElementById('profile-company-details-container');
    
    if (toggle) {
        toggle.checked = hasCompany;
    }
    if (container) {
        container.classList.toggle('hidden', !hasCompany);
        // Make company fields required if company features are enabled
        const toggleFields = ['profile-company-name', 'profile-company-email', 'profile-company-phone', 'profile-company-address'];
        toggleFields.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.required = hasCompany;
            }
        });
    }

    // Company details
    document.getElementById('profile-company-name').value = currentUser.company_name || '';
    document.getElementById('profile-company-email').value = currentUser.company_email || '';
    document.getElementById('profile-company-phone').value = currentUser.company_phone || '';
    document.getElementById('profile-company-address').value = currentUser.company_address || '';
    document.getElementById('profile-bank-details').value = currentUser.bank_details || '';
    document.getElementById('profile-invoice-notes-terms').value = currentUser.invoice_notes_terms || '';
    
    if (currentUser.company_logo) {
        document.getElementById('profile-logo-preview').src = pb.files.getUrl(currentUser, currentUser.company_logo);
    } else {
        document.getElementById('profile-logo-preview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 2L2 22h20L12 2z'/%3E%3C/svg%3E";
    }
}

// ==================== RENDER: DASHBOARD ANALYTICS ====================
function renderDashboardStats() {
    // Resolve date filter boundaries
    let startD = new Date(0);
    let endD = new Date(9999, 11, 31);
    if (dashboardDateFilterType === 'month' && dashboardDateMonth) {
        const [year, month] = dashboardDateMonth.split('-');
        const y = parseInt(year, 10);
        const m = parseInt(month, 10) - 1;
        startD = new Date(y, m, 1);
        endD = new Date(y, m + 1, 0, 23, 59, 59, 999);
    } else if (dashboardDateFilterType === 'custom') {
        if (dashboardDateFrom) {
            startD = new Date(dashboardDateFrom);
            startD.setHours(0, 0, 0, 0);
        }
        if (dashboardDateTo) {
            endD = new Date(dashboardDateTo);
            endD.setHours(23, 59, 59, 999);
        }
    }

    const personalIncomeFiltered = appData.personalIncome.filter(r => isDateInFilter(r.date));
    const personalExpensesFiltered = getExpandedExpenses(appData.personalExpenses, startD, endD);
    
    const businessIncomeFiltered = appData.businessIncome.filter(r => isDateInFilter(r.date));
    const businessExpensesFiltered = getExpandedExpenses(appData.businessExpenses, startD, endD);

    const investmentsFiltered = appData.investments.filter(r => isDateInFilter(r.purchase_date));
    const investmentExpensesFiltered = appData.investmentExpenses.filter(r => isDateInFilter(r.date));
    
    const invoicesFiltered = appData.invoices.filter(r => isDateInFilter(r.issue_date));

    // Calculators
    const pIncSum = personalIncomeFiltered.reduce((acc, row) => acc + (row.amount || 0), 0);
    const pExpSum = personalExpensesFiltered.reduce((acc, row) => acc + (row.amount || 0), 0);
    
    const bIncSum = businessIncomeFiltered.reduce((acc, row) => acc + (row.amount || 0), 0);
    const bExpSum = businessExpensesFiltered.reduce((acc, row) => acc + (row.amount || 0), 0);

    const invAssetsCapital = investmentsFiltered.reduce((acc, row) => acc + (row.initial_amount || 0), 0);
    const invAssetsCurrent = investmentsFiltered.reduce((acc, row) => acc + (row.current_val || 0), 0);
    const invFeesSum = investmentExpensesFiltered.reduce((acc, row) => acc + (row.amount || 0), 0);
    
    const outstandingInvoices = invoicesFiltered
        .filter(i => i.status !== 'Paid' && i.status !== 'Draft')
        .reduce((acc, i) => acc + (i.total_amount || 0), 0);
    const paidInvoicesCount = invoicesFiltered.filter(i => i.status === 'Paid').length;
    const pendingInvoicesCount = invoicesFiltered.filter(i => i.status === 'Sent' || i.status === 'Overdue').length;

    // Fill UI Values
    document.getElementById('stat-personal-net').textContent = formatVal(pIncSum - pExpSum);
    document.getElementById('stat-personal-income-sum').textContent = `+${formatVal(pIncSum)}`;
    document.getElementById('stat-personal-expense-sum').textContent = `-${formatVal(pExpSum)}`;

    document.getElementById('stat-business-net').textContent = formatVal(bIncSum - bExpSum);
    document.getElementById('stat-business-income-sum').textContent = `+${formatVal(bIncSum)}`;
    document.getElementById('stat-business-expense-sum').textContent = `-${formatVal(bExpSum)}`;

    document.getElementById('stat-investments-value').textContent = formatVal(invAssetsCurrent);
    
    // Total Net ROI
    const netReturn = invAssetsCurrent - invAssetsCapital - invFeesSum;
    const roiPercent = invAssetsCapital > 0 ? (netReturn / invAssetsCapital) * 100 : 0;
    
    const roiBadge = document.getElementById('stat-investments-roi');
    roiBadge.textContent = `${roiPercent.toFixed(2)}%`;
    if (roiPercent >= 0) {
        roiBadge.className = 'text-emerald';
        roiBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${roiPercent.toFixed(2)}%`;
    } else {
        roiBadge.className = 'text-rose';
        roiBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> ${roiPercent.toFixed(2)}%`;
    }

    document.getElementById('stat-invoices-outstanding').textContent = formatVal(outstandingInvoices);
    document.getElementById('stat-invoices-paid-count').textContent = paidInvoicesCount;
    document.getElementById('stat-invoices-pending-count').textContent = pendingInvoicesCount;

    // Segment Card toggles
    const pCard = document.getElementById('card-wrapper-personal');
    const bCard = document.getElementById('card-wrapper-business');
    const iCard = document.getElementById('card-wrapper-investments');
    const invCard = document.getElementById('card-wrapper-invoices');

    if (currentDashboardSegment === 'all') {
        pCard.classList.remove('hidden');
        bCard.classList.remove('hidden');
        iCard.classList.remove('hidden');
        invCard.classList.remove('hidden');
    } else if (currentDashboardSegment === 'personal') {
        pCard.classList.remove('hidden');
        bCard.classList.add('hidden');
        iCard.classList.add('hidden');
        invCard.classList.add('hidden');
    } else if (currentDashboardSegment === 'business') {
        pCard.classList.add('hidden');
        bCard.classList.remove('hidden');
        iCard.classList.add('hidden');
        invCard.classList.remove('hidden');
    } else if (currentDashboardSegment === 'investments') {
        pCard.classList.add('hidden');
        bCard.classList.add('hidden');
        iCard.classList.remove('hidden');
        invCard.classList.add('hidden');
    }

    // Toggle bottom list components
    const subListWrapper = document.getElementById('card-wrapper-subscriptions-list');
    const invListWrapper = document.getElementById('card-wrapper-investments-list');

    if (currentDashboardSegment === 'all') {
        subListWrapper.classList.remove('hidden');
        invListWrapper.classList.remove('hidden');
    } else if (currentDashboardSegment === 'personal') {
        subListWrapper.classList.remove('hidden');
        invListWrapper.classList.add('hidden');
    } else if (currentDashboardSegment === 'business') {
        subListWrapper.classList.remove('hidden');
        invListWrapper.classList.add('hidden');
    } else if (currentDashboardSegment === 'investments') {
        subListWrapper.classList.add('hidden');
        invListWrapper.classList.remove('hidden');
    }

    // Load Subscriptions List into Dashboard
    let subPool = [];
    if (currentDashboardSegment === 'all') {
        subPool = [
            ...appData.personalExpenses.filter(e => e.is_subscription),
            ...appData.businessExpenses.filter(e => e.is_subscription)
        ];
    } else if (currentDashboardSegment === 'personal') {
        subPool = appData.personalExpenses.filter(e => e.is_subscription);
    } else if (currentDashboardSegment === 'business') {
        subPool = appData.businessExpenses.filter(e => e.is_subscription);
    }

    // Filter subscription list by date filter too, and exclude if unsubscribed in the past
    subPool = subPool.filter(sub => {
        if (!isDateInFilter(sub.date)) return false;
        if (sub.unsubscribe_date) {
            const unsub = new Date(sub.unsubscribe_date);
            const today = new Date();
            today.setHours(0,0,0,0);
            if (unsub < today) return false; // Exclude if already unsubscribed
        }
        return true;
    });

    const subscriptions = subPool.map(sub => {
        const nextDue = calculateNextRenewal(sub.date, sub.frequency, sub.unsubscribe_date);
        return { ...sub, nextDue };
    }).sort((a, b) => a.nextDue - b.nextDue);

    const subContainer = document.getElementById('dashboard-subscriptions-list');
    subContainer.innerHTML = '';
    
    if (subscriptions.length === 0) {
        subContainer.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No active subscriptions detected.</td></tr>`;
    } else {
        subscriptions.forEach(sub => {
            subContainer.innerHTML += `
                <tr>
                    <td><strong>${sub.title}</strong></td>
                    <td><span class="badge ${sub.frequency === 'monthly' ? 'monthly' : 'yearly'}">${sub.frequency}</span></td>
                    <td class="text-rose font-bold">-${formatVal(sub.amount)}</td>
                    <td>${sub.is_subscription ? 'Subscription' : 'Expense'}</td>
                    <td><i class="fa-regular fa-calendar-days text-muted"></i> ${formatDateToDMY(sub.nextDue)}</td>
                </tr>
            `;
        });
    }

    // Load Portfolio List into Dashboard
    const filteredInvestments = appData.investments.filter(r => isDateInFilter(r.purchase_date));
    const topInvs = [...filteredInvestments].sort((a, b) => (b.current_val - b.initial_amount) - (a.current_val - a.initial_amount));
    const invContainer = document.getElementById('dashboard-investments-list');
    invContainer.innerHTML = '';
    
    if (topInvs.length === 0) {
        invContainer.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No investments logged.</td></tr>`;
    } else {
        topInvs.slice(0, 5).forEach(inv => {
            const gain = inv.current_val - inv.initial_amount;
            const roi = inv.initial_amount > 0 ? (gain / inv.initial_amount) * 100 : 0;
            const textClass = gain >= 0 ? 'text-emerald' : 'text-rose';
            
            invContainer.innerHTML += `
                <tr>
                    <td><strong>${inv.name}</strong> <span class="text-muted text-sm">(${inv.type})</span></td>
                    <td>${formatVal(inv.initial_amount)}</td>
                    <td>${formatVal(inv.current_val)}</td>
                    <td class="${textClass} font-bold">${roi.toFixed(1)}%</td>
                </tr>
            `;
        });
    }

    // Draw Dashboard Charts
    renderDashboardCharts();
}

function renderDashboardCharts() {
    const ctxCashflow = document.getElementById('cashflowTrendChart').getContext('2d');
    const ctxExpense = document.getElementById('expenseDistributionChart').getContext('2d');

    // Destroy existing charts
    if (charts.cashflow) charts.cashflow.destroy();
    if (charts.expense) charts.expense.destroy();

    // Theme adaptive color rules
    const isLight = document.body.getAttribute('data-theme') === 'light';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    const textColor = isLight ? '#475569' : '#94a3b8';

    const cashflowWrapper = document.getElementById('card-wrapper-cashflow-chart');
    const expenseWrapper = document.getElementById('card-wrapper-expense-chart');
    const expenseChartTitle = document.getElementById('expense-chart-title');

    if (currentDashboardSegment === 'investments') {
        // Hide cashflow chart in investments segment
        cashflowWrapper.classList.add('hidden');
        expenseWrapper.classList.remove('hidden');
        expenseChartTitle.textContent = 'Investment Asset Allocation by Type';
        
        const investmentsFiltered = appData.investments.filter(r => isDateInFilter(r.purchase_date));
        
        // Accumulate investments asset types
        const types = {};
        investmentsFiltered.forEach(asset => {
            const t = asset.type || 'Other';
            types[t] = (types[t] || 0) + (asset.current_val || 0);
        });

        const typeLabels = Object.keys(types);
        const typeValues = Object.values(types);

        charts.expense = new Chart(ctxExpense, {
            type: 'doughnut',
            data: {
                labels: typeLabels.length > 0 ? typeLabels : ['No Assets'],
                datasets: [{
                    data: typeValues.length > 0 ? typeValues : [1],
                    backgroundColor: [
                        '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#d946ef', '#f43f5e', '#3b82f6', '#94a3b8'
                    ],
                    borderWidth: 1,
                    borderColor: isLight ? '#ffffff' : '#0f1524'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
                    }
                }
            }
        });
        return; // skip cashflow rendering
    }

    // If not investments, restore defaults
    cashflowWrapper.classList.remove('hidden');
    expenseWrapper.classList.remove('hidden');
    expenseChartTitle.textContent = 'Expense Breakdown by Categories';

    // 1. CASHFLOW CHART: Calculate Dynamic Groupings based on Date Filter
    let months = [];
    let incomes = [];
    let expenses = [];

    // Resolve date filter boundaries
    let startD = new Date(0);
    let endD = new Date(9999, 11, 31);
    if (dashboardDateFilterType === 'month' && dashboardDateMonth) {
        const [year, month] = dashboardDateMonth.split('-');
        const y = parseInt(year, 10);
        const m = parseInt(month, 10) - 1;
        startD = new Date(y, m, 1);
        endD = new Date(y, m + 1, 0, 23, 59, 59, 999);
    } else if (dashboardDateFilterType === 'custom') {
        if (dashboardDateFrom) {
            startD = new Date(dashboardDateFrom);
            startD.setHours(0, 0, 0, 0);
        }
        if (dashboardDateTo) {
            endD = new Date(dashboardDateTo);
            endD.setHours(23, 59, 59, 999);
        }
    }

    if (dashboardDateFilterType === 'all') {
        const date = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
            months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
            
            const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
            const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

            const matchMonthYear = (recordDateStr) => {
                const rd = new Date(recordDateStr);
                return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
            };

            let mIncome = 0;
            let mExpense = 0;

            if (currentDashboardSegment === 'all') {
                const mPersonalIncome = appData.personalIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
                const mBusinessIncome = appData.businessIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
                mIncome = mPersonalIncome + mBusinessIncome;

                const mPersonalExpense = getExpandedExpenses(appData.personalExpenses, startOfMonth, endOfMonth).reduce((acc, r) => acc + (r.amount || 0), 0);
                const mBusinessExpense = getExpandedExpenses(appData.businessExpenses, startOfMonth, endOfMonth).reduce((acc, r) => acc + (r.amount || 0), 0);
                mExpense = mPersonalExpense + mBusinessExpense;
            } else if (currentDashboardSegment === 'personal') {
                mIncome = appData.personalIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
                mExpense = getExpandedExpenses(appData.personalExpenses, startOfMonth, endOfMonth).reduce((acc, r) => acc + (r.amount || 0), 0);
            } else if (currentDashboardSegment === 'business') {
                mIncome = appData.businessIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
                mExpense = getExpandedExpenses(appData.businessExpenses, startOfMonth, endOfMonth).reduce((acc, r) => acc + (r.amount || 0), 0);
            }

            incomes.push(mIncome);
            expenses.push(mExpense);
        }
    } else if (dashboardDateFilterType === 'month') {
        const [year, month] = (dashboardDateMonth || new Date().toISOString().slice(0, 7)).split('-');
        const filterYear = parseInt(year, 10);
        const filterMonth = parseInt(month, 10) - 1;

        months = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
        incomes = [0, 0, 0, 0, 0];
        expenses = [0, 0, 0, 0, 0];

        const startOfMonth = new Date(filterYear, filterMonth, 1);
        const endOfMonth = new Date(filterYear, filterMonth + 1, 0, 23, 59, 59, 999);

        const getWeekIndex = (dateStr) => {
            const d = new Date(dateStr);
            const day = d.getDate();
            if (day <= 7) return 0;
            if (day <= 14) return 1;
            if (day <= 21) return 2;
            if (day <= 28) return 3;
            return 4;
        };

        const matchMonthYear = (recordDateStr) => {
            const rd = new Date(recordDateStr);
            return rd.getMonth() === filterMonth && rd.getFullYear() === filterYear;
        };

        const processPool = (incomePool, rawExpensePool) => {
            incomePool.filter(r => matchMonthYear(r.date)).forEach(r => {
                const w = getWeekIndex(r.date);
                incomes[w] += (r.amount || 0);
            });
            const expPool = getExpandedExpenses(rawExpensePool, startOfMonth, endOfMonth);
            expPool.forEach(r => {
                const w = getWeekIndex(r.date);
                expenses[w] += (r.amount || 0);
            });
        };

        if (currentDashboardSegment === 'all') {
            processPool(appData.personalIncome, appData.personalExpenses);
            processPool(appData.businessIncome, appData.businessExpenses);
        } else if (currentDashboardSegment === 'personal') {
            processPool(appData.personalIncome, appData.personalExpenses);
        } else if (currentDashboardSegment === 'business') {
            processPool(appData.businessIncome, appData.businessExpenses);
        }
    } else if (dashboardDateFilterType === 'custom') {
        const start = dashboardDateFrom ? new Date(dashboardDateFrom) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = dashboardDateTo ? new Date(dashboardDateTo) : new Date();
        
        const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

        if (diffDays <= 31) {
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const label = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
                months.push(label);
                
                const matchDay = (recordDateStr) => {
                    const rd = new Date(recordDateStr);
                    return rd.getDate() === d.getDate() && rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
                };

                let dayIncome = 0;
                let dayExpense = 0;

                const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

                const calcDay = (inc, expPool) => {
                    dayIncome += inc.filter(r => matchDay(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
                    dayExpense += getExpandedExpenses(expPool, startOfDay, endOfDay).reduce((acc, r) => acc + (r.amount || 0), 0);
                };

                if (currentDashboardSegment === 'all') {
                    calcDay(appData.personalIncome, appData.personalExpenses);
                    calcDay(appData.businessIncome, appData.businessExpenses);
                } else if (currentDashboardSegment === 'personal') {
                    calcDay(appData.personalIncome, appData.personalExpenses);
                } else if (currentDashboardSegment === 'business') {
                    calcDay(appData.businessIncome, appData.businessExpenses);
                }

                incomes.push(dayIncome);
                expenses.push(dayExpense);
            }
        } else if (diffDays <= 366) {
            let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
            
            while (current <= limit) {
                const label = current.toLocaleString('default', { month: 'short', year: '2-digit' });
                months.push(label);
                
                const targetMonth = current.getMonth();
                const targetYear = current.getFullYear();
                
                const startOfMonthRange = new Date(current.getFullYear(), current.getMonth(), 1);
                const startBound = startOfMonthRange < startDate ? startDate : startOfMonthRange;
                const endOfMonthRange = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
                const endBound = endOfMonthRange > endDate ? endDate : endOfMonthRange;

                const matchMonthYear = (recordDateStr) => {
                    const rd = new Date(recordDateStr);
                    if (rd < startDate || rd > endDate) return false;
                    return rd.getMonth() === targetMonth && rd.getFullYear() === targetYear;
                };

                let mIncome = 0;
                let mExpense = 0;

                const calcMonth = (inc, expPool) => {
                    mIncome += inc.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
                    mExpense += getExpandedExpenses(expPool, startBound, endBound).reduce((acc, r) => acc + (r.amount || 0), 0);
                };

                if (currentDashboardSegment === 'all') {
                    calcMonth(appData.personalIncome, appData.personalExpenses);
                    calcMonth(appData.businessIncome, appData.businessExpenses);
                } else if (currentDashboardSegment === 'personal') {
                    calcMonth(appData.personalIncome, appData.personalExpenses);
                } else if (currentDashboardSegment === 'business') {
                    calcMonth(appData.businessIncome, appData.businessExpenses);
                }

                incomes.push(mIncome);
                expenses.push(mExpense);

                current.setMonth(current.getMonth() + 1);
            }
        } else {
            let currentYear = startDate.getFullYear();
            const limitYear = endDate.getFullYear();
            
            while (currentYear <= limitYear) {
                months.push(String(currentYear));
                
                const targetYear = currentYear;
                
                const startOfYearRange = new Date(currentYear, 0, 1);
                const startBound = startOfYearRange < startDate ? startDate : startOfYearRange;
                const endOfYearRange = new Date(currentYear, 11, 31, 23, 59, 59, 999);
                const endBound = endOfYearRange > endDate ? endDate : endOfYearRange;

                const matchYear = (recordDateStr) => {
                    const rd = new Date(recordDateStr);
                    if (rd < startDate || rd > endDate) return false;
                    return rd.getFullYear() === targetYear;
                };

                let yIncome = 0;
                let yExpense = 0;

                const calcYear = (inc, expPool) => {
                    yIncome += inc.filter(r => matchYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
                    yExpense += getExpandedExpenses(expPool, startBound, endBound).reduce((acc, r) => acc + (r.amount || 0), 0);
                };

                if (currentDashboardSegment === 'all') {
                    calcYear(appData.personalIncome, appData.personalExpenses);
                    calcYear(appData.businessIncome, appData.businessExpenses);
                } else if (currentDashboardSegment === 'personal') {
                    calcYear(appData.personalIncome, appData.personalExpenses);
                } else if (currentDashboardSegment === 'business') {
                    calcYear(appData.businessIncome, appData.businessExpenses);
                }

                incomes.push(yIncome);
                expenses.push(yExpense);

                currentYear++;
            }
        }
    }

    charts.cashflow = new Chart(ctxCashflow, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Total Inflow',
                    data: incomes,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Total Outflow',
                    data: expenses,
                    backgroundColor: '#f43f5e',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor, font: { family: 'Plus Jakarta Sans' } } }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor } },
                y: { grid: { color: gridColor }, ticks: { color: textColor } }
            }
        }
    });

    // 2. EXPENSE DISTRIBUTION CHART: Category breakdown
    const categories = {};
    let expPoolFiltered = [];
    if (currentDashboardSegment === 'all') {
        expPoolFiltered = [
            ...getExpandedExpenses(appData.personalExpenses, startD, endD),
            ...getExpandedExpenses(appData.businessExpenses, startD, endD)
        ];
    } else if (currentDashboardSegment === 'personal') {
        expPoolFiltered = getExpandedExpenses(appData.personalExpenses, startD, endD);
    } else if (currentDashboardSegment === 'business') {
        expPoolFiltered = getExpandedExpenses(appData.businessExpenses, startD, endD);
    }

    expPoolFiltered.forEach(exp => {
        const cat = exp.category || 'Other';
        categories[cat] = (categories[cat] || 0) + (exp.amount || 0);
    });

    const categoryLabels = Object.keys(categories);
    const categoryValues = Object.values(categories);

    charts.expense = new Chart(ctxExpense, {
        type: 'doughnut',
        data: {
            labels: categoryLabels.length > 0 ? categoryLabels : ['No Expenses'],
            datasets: [{
                data: categoryValues.length > 0 ? categoryValues : [1],
                backgroundColor: [
                    '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#d946ef', '#f43f5e', '#3b82f6', '#94a3b8'
                ],
                borderWidth: 1,
                borderColor: isLight ? '#ffffff' : '#0f1524'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
                }
            }
        }
    });
}

// ==================== RENDER: PERSONAL FINANCE TABS ====================
function renderPersonalFinance() {
    // 1. Personal Incomes Render
    const incomeBody = document.getElementById('personal-income-list');
    incomeBody.innerHTML = '';
    
    if (appData.personalIncome.length === 0) {
        incomeBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No income records saved.</td></tr>`;
    } else {
        appData.personalIncome.forEach(row => {
            incomeBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-emerald font-bold">+${formatVal(row.amount)}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td>${formatDateToDMY(row.date)}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_FINANCE_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_FINANCE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // 2. Personal Expenses Render
    const expenseBody = document.getElementById('personal-expense-list');
    expenseBody.innerHTML = '';
    
    if (appData.personalExpenses.length === 0) {
        expenseBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No expense records saved.</td></tr>`;
    } else {
        appData.personalExpenses.forEach(row => {
            const nextDueStr = row.is_subscription 
                ? formatDateToDMY(calculateNextRenewal(row.date, row.frequency, row.unsubscribe_date)) 
                : 'N/A';
            
            expenseBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-rose font-bold">-${formatVal(row.amount)}</td>
                    <td>${row.is_subscription ? '<span class="badge monthly">Subscription</span>' : '<span class="badge one-time">Expense</span>'}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td><i class="fa-regular fa-calendar-days"></i> ${nextDueStr}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

// ==================== RENDER: BUSINESS FINANCE TABS ====================
function renderBusinessFinance() {
    // 1. Business Incomes
    const incomeBody = document.getElementById('business-income-list');
    incomeBody.innerHTML = '';
    
    if (appData.businessIncome.length === 0) {
        incomeBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No business revenues saved.</td></tr>`;
    } else {
        appData.businessIncome.forEach(row => {
            incomeBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-emerald font-bold">+${formatVal(row.amount)}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td>${formatDateToDMY(row.date)}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_FINANCE_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_FINANCE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // 2. Business Expenses
    const expenseBody = document.getElementById('business-expense-list');
    expenseBody.innerHTML = '';
    
    if (appData.businessExpenses.length === 0) {
        expenseBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No business expenses saved.</td></tr>`;
    } else {
        appData.businessExpenses.forEach(row => {
            const nextDueStr = row.is_subscription 
                ? formatDateToDMY(calculateNextRenewal(row.date, row.frequency, row.unsubscribe_date)) 
                : 'N/A';
            
            expenseBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-rose font-bold">-${formatVal(row.amount)}</td>
                    <td>${row.is_subscription ? '<span class="badge monthly">Subscription</span>' : '<span class="badge one-time">Expense</span>'}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td><i class="fa-regular fa-calendar-days"></i> ${nextDueStr}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

// ==================== RENDER: INVESTMENTS ====================
function renderInvestments() {
    const body = document.getElementById('investments-list');
    body.innerHTML = '';
    
    if (appData.investments.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No investments logged yet.</td></tr>`;
    } else {
        appData.investments.forEach(asset => {
            // Find total fees/expenses linked to this asset
            const assetFees = appData.investmentExpenses
                .filter(fee => fee.investment === asset.id)
                .reduce((acc, fee) => acc + (fee.amount || 0), 0);
            
            const netReturn = asset.current_val - asset.initial_amount - assetFees;
            const roiPercent = asset.initial_amount > 0 ? (netReturn / asset.initial_amount) * 100 : 0;
            
            const textClass = netReturn >= 0 ? 'text-emerald' : 'text-rose';
            const iconClass = netReturn >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
            
            body.innerHTML += `
                <tr>
                    <td><strong>${asset.name}</strong></td>
                    <td><span class="badge one-time">${asset.type}</span></td>
                    <td>${formatVal(asset.initial_amount)}</td>
                    <td>${formatVal(asset.current_val)}</td>
                    <td class="text-rose font-bold">-${formatVal(assetFees)}</td>
                    <td class="${textClass} font-bold">${netReturn >= 0 ? '+' : ''}${formatVal(netReturn)}</td>
                    <td class="${textClass} font-bold"><i class="fa-solid ${iconClass}"></i> ${roiPercent.toFixed(2)}%</td>
                    <td>${formatDateToDMY(asset.purchase_date)}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-view" onclick="openAddFeeModal('${asset.id}', '${asset.name}')" title="Log Fee/Expense"><i class="fa-solid fa-receipt"></i></button>
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${asset.id}', 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE')" title="Edit Asset"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${asset.id}', 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // Render separate investment expenses list
    renderInvestmentExpenses();
}

function renderInvestmentExpenses() {
    const listContainer = document.getElementById('investment-expenses-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (appData.investmentExpenses.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No investment expenses logged.</td></tr>`;
        return;
    }
    
    // Asset ID to name map helper
    const assetMap = {};
    appData.investments.forEach(asset => {
        assetMap[asset.id] = asset.name;
    });
    
    appData.investmentExpenses.forEach(exp => {
        const assetName = assetMap[exp.investment] || 'General / Unknown Asset';
        const formattedDate = formatDateToDMY(exp.date);
        
        listContainer.innerHTML += `
            <tr>
                <td><strong>${assetName}</strong> <span class="text-muted text-sm">(${exp.title || 'Expense'})</span></td>
                <td class="text-rose font-bold">-${formatVal(exp.amount)}</td>
                <td><span class="badge one-time">${exp.type}</span></td>
                <td><i class="fa-regular fa-calendar-days text-muted"></i> ${formattedDate}</td>
                <td>${exp.notes || '-'}</td>
                <td>
                    <div class="tbl-actions">
                        <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${exp.id}', 'VRTPOCKET_INVESTMENT_EXPENSES_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function openAddFeeModal(assetId, assetName) {
    document.getElementById('investment-expense-form').reset();
    
    const select = document.getElementById('investment-expense-asset-id');
    select.innerHTML = '';
    
    if (appData.investments.length === 0) {
        select.innerHTML = '<option value="">(No investment assets logged)</option>';
    } else {
        appData.investments.forEach(asset => {
            select.innerHTML += `<option value="${asset.id}">${asset.name} (${asset.type})</option>`;
        });
    }
    
    if (assetId) {
        select.value = assetId;
    }
    openModal('investment-expense-modal');
}

// ==================== TRANSACTION CRUD SYSTEM ====================
async function saveTransactionRecord(e, collectionName, formId, modalId) {
    e.preventDefault();
    showLoading(true);
    
    const form = document.getElementById(formId);
    const recordId = form.querySelector('input[type="hidden"]').value;
    
    // Map fields dynamically based on form types
    const data = {
        user: currentUser.id
    };
    
    // Read form inputs into data payload
    if (formId.includes('income')) {
        data.title = form.querySelector('[id$="-title"]').value;
        data.amount = parseFloat(form.querySelector('[id$="-amount"]').value);
        data.frequency = form.querySelector('[id$="-frequency"]').value;
        data.date = new Date(form.querySelector('[id$="-date"]').value).toISOString();
        data.category = form.querySelector('[id$="-category"]').value;
        data.notes = form.querySelector('[id$="-notes"]').value;
    } else if (formId.includes('expense')) {
        data.title = form.querySelector('[id$="-title"]').value;
        data.amount = parseFloat(form.querySelector('[id$="-amount"]').value);
        data.frequency = form.querySelector('[id$="-frequency"]').value;
        data.date = new Date(form.querySelector('[id$="-date"]').value).toISOString();
        data.category = form.querySelector('[id$="-category"]').value;
        data.is_subscription = form.querySelector('[id$="-is-subscription"]').checked;
        data.notes = form.querySelector('[id$="-notes"]').value;
        
        // Subscription status fields
        if (data.is_subscription) {
            const prefix = formId.startsWith('personal') ? 'personal-expense' : 'business-expense';
            const subStatus = document.getElementById(`${prefix}-sub-status`).value;
            const unsubDateVal = document.getElementById(`${prefix}-unsubscribe-date`).value;
            
            data.sub_status = subStatus;
            if (subStatus === 'unsubscribe' && unsubDateVal) {
                data.unsubscribe_date = new Date(unsubDateVal).toISOString();
            } else {
                data.unsubscribe_date = '';
            }
            
            data.next_due_date = calculateNextRenewal(data.date, data.frequency, data.unsubscribe_date).toISOString();
        } else {
            data.sub_status = '';
            data.unsubscribe_date = '';
        }
    } else if (formId.includes('investment')) {
        data.name = document.getElementById('investment-name').value;
        data.type = document.getElementById('investment-type').value;
        data.initial_amount = parseFloat(document.getElementById('investment-initial').value);
        data.current_val = parseFloat(document.getElementById('investment-current').value);
        data.purchase_date = new Date(document.getElementById('investment-purchase-date').value).toISOString();
        data.notes = document.getElementById('investment-notes').value;
    }

    try {
        if (recordId) {
            // Update
            await pb.collection(collectionName).update(recordId, data);
            showToast('Record updated successfully!', 'success');
        } else {
            // Create
            await pb.collection(collectionName).create(data);
            showToast('Record logged successfully!', 'success');
        }
        closeModal(modalId);
        form.reset();
        syncAllData();
    } catch (error) {
        console.error(error);
        showToast('Saving failed. Check collection permissions/columns.', 'error');
    } finally {
        showLoading(false);
    }
}

async function saveInvestmentFeeRecord(e) {
    e.preventDefault();
    showLoading(true);
    
    const assetId = document.getElementById('investment-expense-asset-id').value;
    const title = document.getElementById('investment-expense-title').value;
    const amount = parseFloat(document.getElementById('investment-expense-amount').value);
    const date = new Date(document.getElementById('investment-expense-date').value).toISOString();
    const type = document.getElementById('investment-expense-type').value;
    const notes = document.getElementById('investment-expense-notes').value;

    const data = {
        investment: assetId,
        title,
        amount,
        date,
        type,
        notes
    };

    try {
        await pb.collection('VRTPOCKET_INVESTMENT_EXPENSES_DATABASE').create(data);
        showToast('Investment fee/expense logged!', 'success');
        closeModal('investment-expense-modal');
        document.getElementById('investment-expense-form').reset();
        syncAllData();
    } catch (error) {
        console.error(error);
        showToast('Failed to log investment fee. Verify table relation.', 'error');
    } finally {
        showLoading(false);
    }
}

async function editTransactionRecord(id, collectionName) {
    showLoading(true);
    try {
        const record = await pb.collection(collectionName).getOne(id);
        
        // Open appropriate form and prefill values
        if (collectionName === 'VRTPOCKET_PERSONAL_FINANCE_DATABASE') {
            document.getElementById('personal-income-id').value = record.id;
            document.getElementById('personal-income-title').value = record.title || '';
            document.getElementById('personal-income-amount').value = record.amount || 0;
            document.getElementById('personal-income-frequency').value = record.frequency || 'one-time';
            document.getElementById('personal-income-date').value = record.date.split(' ')[0];
            document.getElementById('personal-income-category').value = record.category || 'Salary';
            document.getElementById('personal-income-notes').value = record.notes || '';
            document.getElementById('personal-income-modal-title').textContent = 'Modify Personal Income';
            openModal('personal-income-modal');
        } else if (collectionName === 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE') {
            document.getElementById('personal-expense-id').value = record.id;
            document.getElementById('personal-expense-title').value = record.title || '';
            document.getElementById('personal-expense-amount').value = record.amount || 0;
            document.getElementById('personal-expense-frequency').value = record.frequency || 'one-time';
            document.getElementById('personal-expense-date').value = record.date.split(/[ T]/)[0];
            document.getElementById('personal-expense-category').value = record.category || 'Housing';
            document.getElementById('personal-expense-is-subscription').checked = record.is_subscription || false;
            document.getElementById('personal-expense-notes').value = record.notes || '';
            
            const isSub = record.is_subscription || false;
            const subSettings = document.getElementById('personal-expense-subscription-sub-settings');
            if (isSub) {
                subSettings.classList.remove('hidden');
                document.getElementById('personal-expense-sub-status').value = record.sub_status || 'subscribe';
                document.getElementById('personal-expense-unsubscribe-date').value = record.unsubscribe_date ? record.unsubscribe_date.split(/[ T]/)[0] : '';
                updateSubscriptionStatusUI('personal-expense');
            } else {
                subSettings.classList.add('hidden');
            }
            
            document.getElementById('personal-expense-modal-title').textContent = 'Modify Personal Expense';
            openModal('personal-expense-modal');
        } else if (collectionName === 'VRTPOCKET_BUSINESS_FINANCE_DATABASE') {
            document.getElementById('business-income-id').value = record.id;
            document.getElementById('business-income-title').value = record.title || '';
            document.getElementById('business-income-amount').value = record.amount || 0;
            document.getElementById('business-income-frequency').value = record.frequency || 'one-time';
            document.getElementById('business-income-date').value = record.date.split(' ')[0];
            document.getElementById('business-income-category').value = record.category || 'Services';
            document.getElementById('business-income-notes').value = record.notes || '';
            document.getElementById('business-income-modal-title').textContent = 'Modify Business Revenue';
            openModal('business-income-modal');
        } else if (collectionName === 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE') {
            document.getElementById('business-expense-id').value = record.id;
            document.getElementById('business-expense-title').value = record.title || '';
            document.getElementById('business-expense-amount').value = record.amount || 0;
            document.getElementById('business-expense-frequency').value = record.frequency || 'one-time';
            document.getElementById('business-expense-date').value = record.date.split(/[ T]/)[0];
            document.getElementById('business-expense-category').value = record.category || 'Software/SaaS';
            document.getElementById('business-expense-is-subscription').checked = record.is_subscription || false;
            document.getElementById('business-expense-notes').value = record.notes || '';
            
            const isSub = record.is_subscription || false;
            const subSettings = document.getElementById('business-expense-subscription-sub-settings');
            if (isSub) {
                subSettings.classList.remove('hidden');
                document.getElementById('business-expense-sub-status').value = record.sub_status || 'subscribe';
                document.getElementById('business-expense-unsubscribe-date').value = record.unsubscribe_date ? record.unsubscribe_date.split(/[ T]/)[0] : '';
                updateSubscriptionStatusUI('business-expense');
            } else {
                subSettings.classList.add('hidden');
            }
            
            document.getElementById('business-expense-modal-title').textContent = 'Modify Business Expense';
            openModal('business-expense-modal');
        } else if (collectionName === 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE') {
            document.getElementById('investment-id').value = record.id;
            document.getElementById('investment-name').value = record.name || '';
            document.getElementById('investment-type').value = record.type || 'Crypto';
            document.getElementById('investment-purchase-date').value = record.purchase_date.split(' ')[0];
            document.getElementById('investment-initial').value = record.initial_amount || 0;
            document.getElementById('investment-current').value = record.current_val || 0;
            document.getElementById('investment-notes').value = record.notes || '';
            document.getElementById('investment-modal-title').textContent = 'Modify Investment Asset';
            openModal('investment-modal');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to fetch record for editing.', 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteTransactionRecord(id, collectionName) {
    if (!confirm('Are you absolutely sure you want to delete this record?')) return;
    showLoading(true);
    try {
        await pb.collection(collectionName).delete(id);
        showToast('Record deleted.', 'info');
        syncAllData();
    } catch (error) {
        console.error(error);
        showToast('Deletion failed.', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== INVOICE MANAGEMENT SUITE ====================
function renderInvoices() {
    const tableBody = document.getElementById('invoices-table-body');
    tableBody.innerHTML = '';
    
    if (appData.invoices.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No invoices logged.</td></tr>`;
    } else {
        appData.invoices.forEach(inv => {
            const statusClass = `status-${inv.status.toLowerCase()}`;
            tableBody.innerHTML += `
                <tr>
                    <td><strong>${inv.invoice_number}</strong></td>
                    <td>${inv.client_name}</td>
                    <td>${formatDateToDMY(inv.issue_date)}</td>
                    <td>${formatDateToDMY(inv.due_date)}</td>
                    <td class="font-bold">${formatVal(inv.total_amount)}</td>
                    <td><span class="badge ${statusClass}">${inv.status}</span></td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-view" onclick="viewInvoicePaper('${inv.id}')" title="Preview/Print"><i class="fa-regular fa-file-pdf"></i></button>
                            <button class="tbl-btn tbl-btn-edit" onclick="editInvoiceRecord('${inv.id}')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${inv.id}', 'VRTPOCKET_INVOICE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

function openInvoiceCreator() {
    document.getElementById('invoice-form').reset();
    document.getElementById('invoice-record-id').value = '';
    document.getElementById('invoice-items-rows-container').innerHTML = '';
    document.getElementById('invoice-payment-details').value = currentUser.bank_details || '';
    document.getElementById('invoice-notes').value = currentUser.invoice_notes_terms || '';
    document.getElementById('invoice-builder-title').textContent = 'Create Dynamic Invoice';
    
    // Set default dates (issue date = today, due date = today + 30 days)
    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + 30);
    
    document.getElementById('invoice-issue-date').value = today.toISOString().split('T')[0];
    document.getElementById('invoice-due-date').value = due.toISOString().split('T')[0];
    
    // Set sequential invoice number guess
    const invCount = appData.invoices.length + 1;
    document.getElementById('invoice-number').value = `INV-${today.getFullYear()}-${String(invCount).padStart(3, '0')}`;

    // Add first empty item row
    addInvoiceItemRow();

    document.getElementById('invoice-list-container').classList.add('hidden');
    document.getElementById('invoice-builder-container').classList.remove('hidden');
}

function closeInvoiceCreator() {
    document.getElementById('invoice-list-container').classList.remove('hidden');
    document.getElementById('invoice-builder-container').classList.add('hidden');
}

function addInvoiceItemRow(desc = '', qty = 1, price = 0, subItems = []) {
    const container = document.getElementById('invoice-items-rows-container');
    const blockId = 'block-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const total = qty * price;

    const blockHtml = `
        <div class="invoice-item-block" id="${blockId}">
            <div class="invoice-item-row-header">
                <input type="text" class="item-desc" required placeholder="Consulting Services, Widget development" value="${desc}">
                <input type="number" class="item-qty" min="1" required value="${qty}">
                <input type="number" class="item-price" min="0" step="0.01" required value="${price}">
                <span class="item-total-cell">${formatVal(total)}</span>
                <button type="button" class="tbl-btn tbl-btn-delete remove-item-block" onclick="removeInvoiceItemBlock('${blockId}')" title="Delete Item Group"><i class="fa-regular fa-trash-can"></i></button>
            </div>
            
            <div style="display: flex; align-items: center; gap: 0.5rem; padding-left: 1.5rem;">
                <button type="button" class="btn btn-xs btn-outline btn-add-sub-item" onclick="addInvoiceSubItemRow('${blockId}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;"><i class="fa-solid fa-plus"></i> Add Sub-Description</button>
            </div>
            
            <div class="sub-items-container" style="display: flex; flex-direction: column; gap: 0.35rem; padding-left: 1.5rem;">
                <!-- Sub items will be dynamically appended here -->
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', blockHtml);
    
    const block = document.getElementById(blockId);
    block.querySelector('.item-qty').addEventListener('input', () => recalculateRowTotal(blockId));
    block.querySelector('.item-price').addEventListener('input', () => recalculateRowTotal(blockId));

    if (Array.isArray(subItems)) {
        subItems.forEach(sub => {
            addInvoiceSubItemRow(blockId, sub.desc, sub.qty, sub.price, sub.hasPrice);
        });
    }
}

function removeInvoiceItemBlock(blockId) {
    const block = document.getElementById(blockId);
    if (block) {
        block.remove();
        calculateInvoiceTotals();
    }
}

function addInvoiceSubItemRow(blockId, desc = '', qty = 1, price = 0, hasPrice = true) {
    const block = document.getElementById(blockId);
    if (!block) return;
    const subContainer = block.querySelector('.sub-items-container');
    const subRowId = 'subrow-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const subTotal = qty * price;

    const subRowHtml = `
        <div class="invoice-sub-item-row" id="${subRowId}">
            <i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right: 0.25rem; color: var(--text-muted); font-size: 0.75rem;"></i>
            <input type="text" class="sub-item-desc" required placeholder="Sub-description detail..." value="${desc}" style="flex-grow: 1; font-size: 0.85rem; padding: 0.2rem 0.4rem;">
            
            <div class="sub-item-price-fields ${hasPrice ? '' : 'hidden'}" style="display: flex; gap: 0.5rem; align-items: center;">
                <input type="number" class="sub-item-qty" min="1" required value="${qty}" style="width: 60px; font-size: 0.85rem; padding: 0.2rem 0.4rem;">
                <input type="number" class="sub-item-price" min="0" step="0.01" required value="${price}" style="width: 80px; font-size: 0.85rem; padding: 0.2rem 0.4rem;">
                <span class="sub-item-total-cell" style="width: 70px; text-align: right; font-weight: 500; font-size: 0.85rem; padding: 0 0.4rem;">${formatVal(subTotal)}</span>
            </div>

            <div class="sub-item-actions" style="display: flex; gap: 0.25rem; align-items: center;">
                <button type="button" class="btn btn-xs btn-outline toggle-sub-pricing ${hasPrice ? 'btn-danger-outline' : ''}" onclick="toggleSubItemPricing('${subRowId}')" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;">
                    ${hasPrice ? '<i class="fa-solid fa-eraser"></i> Remove Price' : '<i class="fa-solid fa-dollar-sign"></i> Add Price'}
                </button>
                <button type="button" class="tbl-btn tbl-btn-delete remove-sub-item-row" onclick="removeInvoiceSubItemRow('${subRowId}')" title="Delete Sub-description" style="width: 24px; height: 24px;"><i class="fa-regular fa-trash-can" style="font-size: 0.75rem;"></i></button>
            </div>
        </div>
    `;
    subContainer.insertAdjacentHTML('beforeend', subRowHtml);

    const subRow = document.getElementById(subRowId);
    subRow.querySelector('.sub-item-qty').addEventListener('input', () => recalculateRowTotal(blockId));
    subRow.querySelector('.sub-item-price').addEventListener('input', () => recalculateRowTotal(blockId));

    recalculateRowTotal(blockId);
}

function removeInvoiceSubItemRow(subRowId) {
    const subRow = document.getElementById(subRowId);
    if (subRow) {
        const blockId = subRow.closest('.invoice-item-block').id;
        subRow.remove();
        recalculateRowTotal(blockId);
    }
}

function toggleSubItemPricing(subRowId) {
    const subRow = document.getElementById(subRowId);
    if (subRow) {
        const priceFields = subRow.querySelector('.sub-item-price-fields');
        const btn = subRow.querySelector('.toggle-sub-pricing');
        const isHidden = priceFields.classList.contains('hidden');
        
        if (isHidden) {
            priceFields.classList.remove('hidden');
            btn.innerHTML = '<i class="fa-solid fa-eraser"></i> Remove Price';
            btn.classList.add('btn-danger-outline');
        } else {
            priceFields.classList.add('hidden');
            btn.innerHTML = '<i class="fa-solid fa-dollar-sign"></i> Add Price';
            btn.classList.remove('btn-danger-outline');
        }
        recalculateRowTotal(subRow.closest('.invoice-item-block').id);
    }
}

function recalculateRowTotal(blockId) {
    const block = document.getElementById(blockId);
    if (block) {
        const mainQty = parseFloat(block.querySelector('.item-qty').value) || 0;
        const mainPrice = parseFloat(block.querySelector('.item-price').value) || 0;
        let itemSubtotal = mainQty * mainPrice;

        block.querySelectorAll('.invoice-sub-item-row').forEach(subRow => {
            const priceFields = subRow.querySelector('.sub-item-price-fields');
            const totalCell = subRow.querySelector('.sub-item-total-cell');
            
            if (priceFields && !priceFields.classList.contains('hidden')) {
                const subQty = parseFloat(subRow.querySelector('.sub-item-qty').value) || 0;
                const subPrice = parseFloat(subRow.querySelector('.sub-item-price').value) || 0;
                const subTotal = subQty * subPrice;
                totalCell.textContent = formatVal(subTotal);
            } else {
                totalCell.textContent = formatVal(0);
            }
        });

        block.querySelector('.item-total-cell').textContent = formatVal(itemSubtotal);
        calculateInvoiceTotals();
    }
}

function calculateInvoiceTotals() {
    let subtotal = 0;
    document.querySelectorAll('.invoice-item-block').forEach(block => {
        const qty = parseFloat(block.querySelector('.item-qty').value) || 0;
        const price = parseFloat(block.querySelector('.item-price').value) || 0;
        let blockSum = qty * price;
        
        block.querySelectorAll('.invoice-sub-item-row').forEach(subRow => {
            const priceFields = subRow.querySelector('.sub-item-price-fields');
            if (priceFields && !priceFields.classList.contains('hidden')) {
                const subQty = parseFloat(subRow.querySelector('.sub-item-qty').value) || 0;
                const subPrice = parseFloat(subRow.querySelector('.sub-item-price').value) || 0;
                blockSum += subQty * subPrice;
            }
        });
        subtotal += blockSum;
    });

    const taxRate = parseFloat(document.getElementById('invoice-tax').value) || 0;
    const discount = parseFloat(document.getElementById('invoice-discount').value) || 0;

    const taxAmount = subtotal * (taxRate / 100);
    const grandTotal = subtotal + taxAmount - discount;

    document.getElementById('invoice-summary-subtotal').textContent = formatVal(subtotal);
    document.getElementById('invoice-summary-tax').textContent = formatVal(taxAmount);
    document.getElementById('invoice-summary-discount').textContent = `-${formatVal(discount)}`;
    document.getElementById('invoice-summary-total').textContent = formatVal(grandTotal);
}

function getInvoiceItemsPayload() {
    const items = [];
    document.querySelectorAll('.invoice-item-block').forEach(block => {
        const desc = block.querySelector('.item-desc').value;
        const qty = parseFloat(block.querySelector('.item-qty').value) || 1;
        const price = parseFloat(block.querySelector('.item-price').value) || 0;
        
        const subItems = [];
        block.querySelectorAll('.invoice-sub-item-row').forEach(subRow => {
            const subDesc = subRow.querySelector('.sub-item-desc').value;
            const priceFields = subRow.querySelector('.sub-item-price-fields');
            const hasPrice = !priceFields.classList.contains('hidden');
            
            let subQty = 1;
            let subPrice = 0;
            if (hasPrice) {
                subQty = parseFloat(subRow.querySelector('.sub-item-qty').value) || 0;
                subPrice = parseFloat(subRow.querySelector('.sub-item-price').value) || 0;
            }
            
            subItems.push({
                desc: subDesc,
                hasPrice,
                qty: subQty,
                price: subPrice,
                total: hasPrice ? (subQty * subPrice) : 0
            });
        });

        const subTotalSum = subItems.reduce((acc, it) => acc + it.total, 0);
        const itemTotal = (qty * price) + subTotalSum;

        items.push({
            desc,
            qty,
            price,
            subItems,
            total: itemTotal
        });
    });
    return items;
}

// Save or Update Invoices
async function saveInvoiceRecord(e) {
    e.preventDefault();
    showLoading(true);

    const recordId = document.getElementById('invoice-record-id').value;
    const invoiceNumber = document.getElementById('invoice-number').value;
    const clientName = document.getElementById('invoice-client-name').value;
    const clientEmail = document.getElementById('invoice-client-email').value;
    const clientAddress = document.getElementById('invoice-client-address').value;
    const issueDate = new Date(document.getElementById('invoice-issue-date').value).toISOString();
    const dueDate = new Date(document.getElementById('invoice-due-date').value).toISOString();
    const status = document.getElementById('invoice-status').value;
    const taxRate = parseFloat(document.getElementById('invoice-tax').value) || 0;
    const discount = parseFloat(document.getElementById('invoice-discount').value) || 0;
    const paymentDetails = document.getElementById('invoice-payment-details').value;
    const items = getInvoiceItemsPayload();

    const notes = document.getElementById('invoice-notes').value;
    const combinedNotes = notes + "\n---PAYMENT-DETAILS---\n" + paymentDetails;

    // calculate totals
    const subtotal = items.reduce((acc, it) => acc + it.total, 0);
    const totalAmount = subtotal + (subtotal * (taxRate / 100)) - discount;

    const data = {
        user: currentUser.id,
        invoice_number: invoiceNumber,
        client_name: clientName,
        client_email: clientEmail,
        client_address: clientAddress,
        issue_date: issueDate,
        due_date: dueDate,
        status,
        items, // JSON array field in PocketBase
        tax_rate: taxRate,
        discount,
        total_amount: totalAmount,
        notes: combinedNotes,
        payment_details: paymentDetails
    };

    try {
        let savedRecord;
        if (recordId) {
            savedRecord = await pb.collection('VRTPOCKET_INVOICE_DATABASE').update(recordId, data);
            showToast('Invoice details saved.', 'success');
        } else {
            savedRecord = await pb.collection('VRTPOCKET_INVOICE_DATABASE').create(data);
            showToast('Invoice compiled into registry.', 'success');
        }
        
        closeInvoiceCreator();
        syncAllData();
        
        // Open in viewer immediately
        viewInvoicePaper(savedRecord.id);
    } catch (error) {
        console.error(error);
        showToast('Saving invoice failed. Confirm pocketbase column types.', 'error');
    } finally {
        showLoading(false);
    }
}

async function editInvoiceRecord(id) {
    showLoading(true);
    try {
        const inv = await pb.collection('VRTPOCKET_INVOICE_DATABASE').getOne(id);
        
        document.getElementById('invoice-record-id').value = inv.id;
        document.getElementById('invoice-number').value = inv.invoice_number;
        document.getElementById('invoice-client-name').value = inv.client_name;
        document.getElementById('invoice-client-email').value = inv.client_email || '';
        document.getElementById('invoice-client-address').value = inv.client_address || '';
        document.getElementById('invoice-issue-date').value = inv.issue_date.split(' ')[0];
        document.getElementById('invoice-due-date').value = inv.due_date.split(' ')[0];
        document.getElementById('invoice-status').value = inv.status;
        document.getElementById('invoice-tax').value = inv.tax_rate;
        document.getElementById('invoice-discount').value = inv.discount;
        let notesText = inv.notes || '';
        let paymentDetailsText = inv.payment_details || '';

        const delimiter = "\n---PAYMENT-DETAILS---\n";
        if (notesText.includes(delimiter)) {
            const parts = notesText.split(delimiter);
            notesText = parts[0] || '';
            paymentDetailsText = parts[1] || '';
        }

        document.getElementById('invoice-notes').value = notesText;
        document.getElementById('invoice-payment-details').value = paymentDetailsText || inv.payment_details || '';

        // Dynamic rows loading
        const container = document.getElementById('invoice-items-rows-container');
        container.innerHTML = '';
        
        // items payload is a JSON array
        const items = Array.isArray(inv.items) ? inv.items : [];
        if (items.length === 0) {
            addInvoiceItemRow();
        } else {
            items.forEach(it => {
                addInvoiceItemRow(it.desc, it.qty, it.price, it.subItems);
            });
        }

        // Calculate math values
        calculateInvoiceTotals();
        
        document.getElementById('invoice-builder-title').textContent = 'Modify Invoice details';
        document.getElementById('invoice-list-container').classList.add('hidden');
        document.getElementById('invoice-builder-container').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        showToast('Failed to load invoice.', 'error');
    } finally {
        showLoading(false);
    }
}

// Generate PDF / print layout for Invoice
async function viewInvoicePaper(id) {
    showLoading(true);
    try {
        const inv = await pb.collection('VRTPOCKET_INVOICE_DATABASE').getOne(id);
        
        // Company info inside invoice
        document.getElementById('invoice-paper-company-name').textContent = currentUser.company_name || 'My Organization';
        document.getElementById('invoice-paper-company-address').textContent = currentUser.company_address || '';
        document.getElementById('invoice-paper-company-contact').textContent = `Tel: ${currentUser.company_phone || 'N/A'} | Email: ${currentUser.company_email || currentUser.email}`;

        // Set Company Logo
        const printLogo = document.getElementById('invoice-paper-logo');
        if (currentUser.company_logo) {
            printLogo.src = pb.files.getUrl(currentUser, currentUser.company_logo);
            printLogo.classList.remove('hidden');
        } else {
            printLogo.classList.add('hidden');
        }

        // Invoice Meta
        document.getElementById('invoice-paper-number').textContent = inv.invoice_number;
        document.getElementById('invoice-paper-issue-date').textContent = formatDateToDMY(inv.issue_date);
        document.getElementById('invoice-paper-due-date').textContent = formatDateToDMY(inv.due_date);
        
        const statusBadge = document.getElementById('invoice-paper-status');
        statusBadge.textContent = inv.status;
        statusBadge.className = `badge status-${inv.status.toLowerCase()}`;

        // Client info
        document.getElementById('invoice-paper-client-name').textContent = inv.client_name;
        document.getElementById('invoice-paper-client-address').textContent = inv.client_address || '';
        document.getElementById('invoice-paper-client-email').textContent = inv.client_email || '';

        // Fill Items Table
        const tableBody = document.getElementById('invoice-paper-items-list');
        tableBody.innerHTML = '';
        
        const items = Array.isArray(inv.items) ? inv.items : [];
        let subtotal = 0;
        
        items.forEach(it => {
            const displayTotal = it.qty * it.price;
            const subTotalSum = Array.isArray(it.subItems) ? it.subItems.reduce((acc, sub) => acc + (sub.total || 0), 0) : 0;
            const actualTotal = displayTotal + subTotalSum;
            subtotal += actualTotal;
            tableBody.innerHTML += `
                <tr>
                    <td><strong>${it.desc}</strong></td>
                    <td class="text-right">${it.qty}</td>
                    <td class="text-right">${formatVal(it.price)}</td>
                    <td class="text-right font-bold">${formatVal(displayTotal)}</td>
                </tr>
            `;

            if (Array.isArray(it.subItems)) {
                it.subItems.forEach(sub => {
                    const subQtyStr = sub.hasPrice ? `${sub.qty}` : '';
                    const subPriceStr = sub.hasPrice ? `${formatVal(sub.price)}` : '';
                    const subTotalStr = sub.hasPrice ? `${formatVal(sub.total)}` : '';
                    
                    tableBody.innerHTML += `
                        <tr class="sub-item-paper-row" style="background: rgba(255, 255, 255, 0.01);">
                            <td style="padding-left: 2.5rem; color: var(--text-secondary); font-size: 0.85rem;">
                                <i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right: 0.5rem; color: var(--text-muted); font-size: 0.75rem;"></i>
                                ${sub.desc}
                            </td>
                            <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem;">${subQtyStr}</td>
                            <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem;">${subPriceStr}</td>
                            <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 500;">${subTotalStr}</td>
                        </tr>
                    `;
                });
            }
        });

        // Totals maths
        const taxVal = subtotal * (inv.tax_rate / 100);
        document.getElementById('invoice-paper-subtotal').textContent = formatVal(subtotal);
        document.getElementById('invoice-paper-tax').textContent = `${formatVal(taxVal)} (${inv.tax_rate}%)`;
        document.getElementById('invoice-paper-discount').textContent = `-${formatVal(inv.discount)}`;
        document.getElementById('invoice-paper-total').textContent = formatVal(subtotal + taxVal - inv.discount);

        // Memo and payment details
        let notesText = inv.notes || '';
        let paymentDetailsText = inv.payment_details || '';

        const delimiter = "\n---PAYMENT-DETAILS---\n";
        if (notesText.includes(delimiter)) {
            const parts = notesText.split(delimiter);
            notesText = parts[0] || '';
            paymentDetailsText = parts[1] || '';
        }

        const pDetailsText = document.getElementById('invoice-paper-payment-details-text');
        const pDetailsBox = document.getElementById('invoice-paper-payment-details-box');
        
        if (paymentDetailsText && paymentDetailsText.trim() !== '') {
            pDetailsText.textContent = paymentDetailsText;
            pDetailsBox.classList.remove('hidden');
        } else {
            pDetailsText.textContent = '';
            pDetailsBox.classList.add('hidden');
        }

        document.getElementById('invoice-paper-notes-text').textContent = notesText || 'Thank you for your business!';

        // Toggle UI
        document.getElementById('invoice-list-container').classList.add('hidden');
        document.getElementById('invoice-view-container').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        showToast('Error loading print rendering.', 'error');
    } finally {
        showLoading(false);
    }
}

function closeInvoiceViewer() {
    document.getElementById('invoice-list-container').classList.remove('hidden');
    document.getElementById('invoice-view-container').classList.add('hidden');
}

// ==================== REPORTS COMPILATION ENGINE ====================
function compileReport(e) {
    if (e) e.preventDefault();
    
    const startDateVal = document.getElementById('report-start-date').value;
    const endDateVal = document.getElementById('report-end-date').value;
    
    if (!startDateVal || !endDateVal) {
        const distBody = document.getElementById('report-distribution-body');
        const txBody = document.getElementById('report-transactions-body');
        if (distBody) distBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Please select a date range and compile.</td></tr>`;
        if (txBody) txBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Please select a date range and compile.</td></tr>`;
        
        document.getElementById('report-total-income').textContent = formatVal(0);
        document.getElementById('report-total-expenses').textContent = formatVal(0);
        document.getElementById('report-net-surplus').textContent = formatVal(0);
        document.getElementById('report-investment-summary').textContent = `${formatVal(0)} (0.00%)`;
        document.getElementById('report-period-text').textContent = 'No Date Range Selected';
        
        const reportDoc = document.getElementById('report-document');
        if (reportDoc) reportDoc.classList.add('hidden');
        return;
    }
    
    const reportDoc = document.getElementById('report-document');
    if (reportDoc) reportDoc.classList.remove('hidden');
    
    const scope = document.getElementById('report-segment').value;

    const start = startDateVal ? new Date(startDateVal) : new Date(0); // far past
    const end = endDateVal ? new Date(endDateVal) : new Date(9999, 11, 31); // far future if empty
    if (endDateVal) {
        end.setHours(23, 59, 59, 999); // boundary
    }

    // Meta report headers
    document.getElementById('report-company-name').textContent = currentUser.company_name || 'My Organization';
    document.getElementById('report-gen-date').textContent = formatDateToDMY(new Date());
    const startText = startDateVal ? formatDateToDMY(startDateVal) : 'All Time';
    const endText = endDateVal ? formatDateToDMY(endDateVal) : 'All Time';
    document.getElementById('report-period-text').textContent = (startDateVal || endDateVal) ? `${startText} to ${endText}` : 'All Time';
    
    const logoPrint = document.getElementById('report-company-logo');
    if (currentUser.company_logo) {
        logoPrint.src = pb.files.getUrl(currentUser, currentUser.company_logo);
        logoPrint.classList.remove('hidden');
    } else {
        logoPrint.classList.add('hidden');
    }

    // Combine data lists based on selected scope
    let incomePool = [];
    let personalExp = [];
    let businessExp = [];
    
    if (scope === 'all' || scope === 'personal') {
        incomePool = [...incomePool, ...appData.personalIncome.map(r => ({ ...r, origin: 'Personal' }))];
        personalExp = getExpandedExpenses(appData.personalExpenses, start, end).map(r => ({ ...r, origin: 'Personal' }));
    }
    if (scope === 'all' || scope === 'business') {
        incomePool = [...incomePool, ...appData.businessIncome.map(r => ({ ...r, origin: 'Business' }))];
        businessExp = getExpandedExpenses(appData.businessExpenses, start, end).map(r => ({ ...r, origin: 'Business' }));
    }

    // Date filters apply
    const filteredIncome = incomePool.filter(r => {
        const d = new Date(r.date);
        return d >= start && d <= end;
    });

    const filteredExpenses = [...personalExp, ...businessExp];

    const totalInflow = filteredIncome.reduce((acc, r) => acc + (r.amount || 0), 0);
    const totalOutflow = filteredExpenses.reduce((acc, r) => acc + (r.amount || 0), 0);
    const surplus = totalInflow - totalOutflow;

    document.getElementById('report-total-income').textContent = formatVal(totalInflow);
    document.getElementById('report-total-expenses').textContent = `-${formatVal(totalOutflow)}`;
    
    const surplusEl = document.getElementById('report-net-surplus');
    surplusEl.textContent = formatVal(surplus);
    surplusEl.className = surplus >= 0 ? 'text-emerald' : 'text-rose';

    // Investment summary value inside report
    const totalCap = appData.investments.reduce((acc, r) => acc + (r.initial_amount || 0), 0);
    const totalCur = appData.investments.reduce((acc, r) => acc + (r.current_val || 0), 0);
    const totalFees = appData.investmentExpenses.reduce((acc, r) => acc + (r.amount || 0), 0);
    const netReturn = totalCur - totalCap - totalFees;
    const roi = totalCap > 0 ? (netReturn / totalCap) * 100 : 0;
    
    document.getElementById('report-investment-summary').textContent = `${formatVal(totalCur)} (${roi.toFixed(2)}% ROI)`;

    // Render category break down table
    const categoryAgg = {};
    filteredIncome.forEach(r => {
        const key = `${r.category}_Income_${r.origin}`;
        if (!categoryAgg[key]) {
            categoryAgg[key] = { name: r.category, classification: 'Inflow', origin: r.origin, sum: 0 };
        }
        categoryAgg[key].sum += r.amount || 0;
    });

    filteredExpenses.forEach(r => {
        const key = `${r.category}_Expense_${r.origin}`;
        if (!categoryAgg[key]) {
            categoryAgg[key] = { name: r.category, classification: 'Outflow', origin: r.origin, sum: 0 };
        }
        categoryAgg[key].sum += r.amount || 0;
    });

    const distBody = document.getElementById('report-distribution-body');
    distBody.innerHTML = '';
    
    const catList = Object.values(categoryAgg).sort((a,b) => b.sum - a.sum);
    if (catList.length === 0) {
        distBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No distribution data transacted in this period.</td></tr>`;
    } else {
        catList.forEach(c => {
            const classColor = c.classification === 'Inflow' ? 'text-emerald' : 'text-rose';
            const originBadgeClass = c.origin === 'Personal' ? 'personal-badge' : 'business-badge';
            const typeBadgeClass = c.classification === 'Inflow' ? 'inflow' : 'outflow';
            distBody.innerHTML += `
                <tr>
                    <td><strong>${c.name}</strong></td>
                    <td><span class="badge ${originBadgeClass}">${c.origin} Operations</span></td>
                    <td><span class="badge ${typeBadgeClass}">${c.classification}</span></td>
                    <td class="text-right ${classColor} font-bold">${c.classification === 'Inflow' ? '+' : '-'}${formatVal(c.sum)}</td>
                </tr>
            `;
        });
    }

    // Render top transaction list in reports
    const txBody = document.getElementById('report-transactions-body');
    txBody.innerHTML = '';
    
    const combinedTx = [
        ...filteredIncome.map(r => ({ ...r, class: 'Inflow' })),
        ...filteredExpenses.map(r => ({ ...r, class: 'Outflow' }))
    ].sort((a,b) => new Date(b.date) - new Date(a.date));

    if (combinedTx.length === 0) {
        txBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No transactions found.</td></tr>`;
    } else {
        combinedTx.slice(0, 20).forEach(t => {
            const classColor = t.class === 'Inflow' ? 'text-emerald' : 'text-rose';
            const originBadgeClass = t.origin === 'Personal' ? 'personal-badge' : 'business-badge';
            const typeBadgeClass = t.class === 'Inflow' ? 'inflow' : 'outflow';
            txBody.innerHTML += `
                <tr>
                    <td>${formatDateToDMY(t.date)}</td>
                    <td>
                        <div class="flex-align-center" style="gap: 0.35rem; display: inline-flex; align-items: center;">
                            <span class="badge ${originBadgeClass}">${t.origin}</span>
                            <span class="badge ${typeBadgeClass}">${t.class}</span>
                        </div>
                    </td>
                    <td class="report-title-cell"><strong>${t.title || t.name}</strong> <span class="text-muted text-sm">(${t.category})</span></td>
                    <td><span class="badge ${t.frequency}">${t.frequency}</span></td>
                    <td class="text-right ${classColor} font-bold">${t.class === 'Inflow' ? '+' : '-'}${formatVal(t.amount)}</td>
                </tr>
            `;
        });
    }
}

// ==================== TRANSACTION TEMPLATE AUTOFILL ENGINE ====================
function openAutofill(context) {
    currentAutofillContext = context;
    document.getElementById('autofill-frequency-selector').classList.remove('hidden');
    document.getElementById('autofill-list-wrapper').classList.add('hidden');
    openModal('autofill-modal');
}

function showAutofillTemplates(frequency) {
    let sourceData = [];
    let isExpense = false;
    
    if (currentAutofillContext === 'personal-income') {
        sourceData = appData.personalIncome;
    } else if (currentAutofillContext === 'personal-expense') {
        sourceData = appData.personalExpenses;
        isExpense = true;
    } else if (currentAutofillContext === 'business-income') {
        sourceData = appData.businessIncome;
    } else if (currentAutofillContext === 'business-expense') {
        sourceData = appData.businessExpenses;
        isExpense = true;
    }

    // Filter by frequency matching selection (monthly or yearly)
    const filtered = sourceData.filter(item => (item.frequency || '').toLowerCase() === frequency.toLowerCase());

    // De-duplicate items based on guidelines
    const seen = new Set();
    const uniqueTemplates = [];

    filtered.forEach(item => {
        let key = '';
        if (isExpense) {
            // Expense guidelines: title, amount, frequency, category, is_subscription flag
            key = `${(item.title || '').trim().toLowerCase()}_${item.amount}_${(item.frequency || '').toLowerCase()}_${(item.category || '').trim().toLowerCase()}_${!!item.is_subscription}`;
        } else {
            // Income guidelines: title, amount, frequency, category
            key = `${(item.title || '').trim().toLowerCase()}_${item.amount}_${(item.frequency || '').toLowerCase()}_${(item.category || '').trim().toLowerCase()}`;
        }
        if (!seen.has(key)) {
            seen.add(key);
            uniqueTemplates.push(item);
        }
    });

    const tbody = document.getElementById('autofill-list-body');
    tbody.innerHTML = '';

    if (uniqueTemplates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No previous ${frequency} templates found.</td></tr>`;
    } else {
        uniqueTemplates.forEach((item) => {
            const escapedJson = encodeURIComponent(JSON.stringify(item));
            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.title || 'Untitled'}</strong></td>
                    <td>${item.category || 'N/A'}</td>
                    <td>${formatVal(item.amount)}</td>
                    <td class="text-right">
                        <button type="button" class="btn btn-xs btn-primary" onclick="selectAutofillTemplate('${escapedJson}')">Select</button>
                    </td>
                </tr>
            `;
        });
    }

    document.getElementById('autofill-frequency-selector').classList.add('hidden');
    document.getElementById('autofill-list-wrapper').classList.remove('hidden');
}

function selectAutofillTemplate(escapedJson) {
    const item = JSON.parse(decodeURIComponent(escapedJson));
    
    if (currentAutofillContext === 'personal-income') {
        document.getElementById('personal-income-title').value = item.title || '';
        document.getElementById('personal-income-amount').value = item.amount || 0;
        document.getElementById('personal-income-frequency').value = item.frequency || 'one-time';
        document.getElementById('personal-income-category').value = item.category || 'Other';
        // Only keep date and notes fields empty
        document.getElementById('personal-income-date').value = '';
        document.getElementById('personal-income-notes').value = '';
    } else if (currentAutofillContext === 'personal-expense') {
        document.getElementById('personal-expense-title').value = item.title || '';
        document.getElementById('personal-expense-amount').value = item.amount || 0;
        document.getElementById('personal-expense-frequency').value = item.frequency || 'one-time';
        document.getElementById('personal-expense-category').value = item.category || 'Other';
        
        const isSub = !!item.is_subscription;
        document.getElementById('personal-expense-is-subscription').checked = isSub;
        const subSettings = document.getElementById('personal-expense-subscription-sub-settings');
        if (isSub) {
            subSettings.classList.remove('hidden');
            document.getElementById('personal-expense-sub-status').value = 'subscribe';
            updateSubscriptionStatusUI('personal-expense');
        } else {
            subSettings.classList.add('hidden');
        }
        // Only keep date and notes fields empty
        document.getElementById('personal-expense-date').value = '';
        document.getElementById('personal-expense-notes').value = '';
    } else if (currentAutofillContext === 'business-income') {
        document.getElementById('business-income-title').value = item.title || '';
        document.getElementById('business-income-amount').value = item.amount || 0;
        document.getElementById('business-income-frequency').value = item.frequency || 'one-time';
        document.getElementById('business-income-category').value = item.category || 'Other';
        // Only keep date and notes fields empty
        document.getElementById('business-income-date').value = '';
        document.getElementById('business-income-notes').value = '';
    } else if (currentAutofillContext === 'business-expense') {
        document.getElementById('business-expense-title').value = item.title || '';
        document.getElementById('business-expense-amount').value = item.amount || 0;
        document.getElementById('business-expense-frequency').value = item.frequency || 'one-time';
        document.getElementById('business-expense-category').value = item.category || 'Other';
        
        const isSub = !!item.is_subscription;
        document.getElementById('business-expense-is-subscription').checked = isSub;
        const subSettings = document.getElementById('business-expense-subscription-sub-settings');
        if (isSub) {
            subSettings.classList.remove('hidden');
            document.getElementById('business-expense-sub-status').value = 'subscribe';
            updateSubscriptionStatusUI('business-expense');
        } else {
            subSettings.classList.add('hidden');
        }
        // Only keep date and notes fields empty
        document.getElementById('business-expense-date').value = '';
        document.getElementById('business-expense-notes').value = '';
    }

    closeModal('autofill-modal');
}

// ==================== SUBSCRIPTION RECURRENCE GENERATION SYSTEM ====================
function updateSubscriptionStatusUI(prefix) {
    const statusSelect = document.getElementById(`${prefix}-sub-status`);
    const statusBadge = document.getElementById(`${prefix}-status-badge`);
    const unsubWrapper = document.getElementById(`${prefix}-unsubscribe-date-wrapper`);
    const unsubInput = document.getElementById(`${prefix}-unsubscribe-date`);
    
    if (statusSelect.value === 'subscribe') {
        statusBadge.textContent = 'Subscribed';
        statusBadge.className = 'badge status-paid';
        unsubWrapper.classList.add('hidden');
        unsubInput.value = '';
    } else {
        statusBadge.textContent = 'Unsubscribed';
        statusBadge.className = 'badge status-overdue';
        unsubWrapper.classList.remove('hidden');
    }
}

function getSubscriptionOccurrences(sub, startFilter, endFilter) {
    const occurrences = [];
    if (!sub.is_subscription) {
        const d = new Date(sub.date);
        if (d >= startFilter && d <= endFilter) {
            occurrences.push({ ...sub, date: sub.date });
        }
        return occurrences;
    }

    const startDate = new Date(sub.date);
    const frequency = (sub.frequency || 'monthly').toLowerCase();
    
    // Unsubscribe Date limit
    let unsubLimit = null;
    if (sub.unsubscribe_date) {
        unsubLimit = new Date(sub.unsubscribe_date);
    }

    // Current local date (Today) limit
    const todayLimit = new Date();
    todayLimit.setHours(23, 59, 59, 999);

    // Limit date is the minimum of unsubscribe date (if set) and today
    let maxDate = todayLimit;
    if (unsubLimit && unsubLimit < maxDate) {
        maxDate = unsubLimit;
    }

    let current = new Date(startDate);
    
    while (current <= maxDate) {
        if (current >= startFilter && current <= endFilter) {
            occurrences.push({
                ...sub,
                date: current.toISOString(),
                isOccurrence: true
            });
        }

        if (frequency === 'monthly') {
            current.setMonth(current.getMonth() + 1);
        } else if (frequency === 'yearly') {
            current.setFullYear(current.getFullYear() + 1);
        } else {
            break;
        }
    }

    return occurrences;
}

function getExpandedExpenses(expensesPool, startFilter, endFilter) {
    const start = startFilter || new Date(0);
    const end = endFilter || new Date(9999, 11, 31);
    let expanded = [];
    expensesPool.forEach(row => {
        expanded = [...expanded, ...getSubscriptionOccurrences(row, start, end)];
    });
    return expanded;
}

// ==================== WIZARD & RESTRICTION CONTROLS ====================

// Show specific signup wizard step
function showSignupStep(step) {
    signupCurrentStep = step;
    
    // Toggle active state on step sections
    document.getElementById('wizard-step-1').classList.toggle('hidden', step !== 1);
    document.getElementById('wizard-step-2').classList.toggle('hidden', step !== 2);
    document.getElementById('wizard-step-3').classList.toggle('hidden', step !== 3);
    
    // Update progress fill line
    const fill = document.getElementById('signup-progress-fill');
    if (fill) {
        if (step === 1) fill.style.width = '0%';
        else if (step === 2) fill.style.width = '50%';
        else if (step === 3) fill.style.width = '100%';
    }
    
    // Update step indicators active/completed states
    for (let i = 1; i <= 3; i++) {
        const ind = document.getElementById(`step-indicator-${i}`);
        if (ind) {
            ind.classList.toggle('active', i === step);
            ind.classList.toggle('completed', i < step);
        }
    }
}

// Form validation helper for wizard steps
function validateStepInputs(stepContainerId) {
    const container = document.getElementById(stepContainerId);
    if (!container) return true;
    const inputs = container.querySelectorAll('input[required], textarea[required], select[required]');
    for (const input of inputs) {
        if (!input.checkValidity()) {
            input.reportValidity();
            return false;
        }
    }
    return true;
}

// Apply company-specific feature restrictions dynamically
function applyCompanyRestrictions(user) {
    if (!user) return;
    
    const hasCompany = !!user.has_company;
    
    // 1. Sidebar Nav links
    const businessLink = document.querySelector('.nav-link[data-tab="business-tab"]');
    const invoicesLink = document.querySelector('.nav-link[data-tab="invoices-tab"]');
    
    if (businessLink) {
        businessLink.classList.toggle('disabled', !hasCompany);
        if (!hasCompany) {
            businessLink.title = "Company features disabled. Enable in Settings.";
        } else {
            businessLink.removeAttribute('title');
        }
    }
    
    if (invoicesLink) {
        invoicesLink.classList.toggle('disabled', !hasCompany);
        if (!hasCompany) {
            invoicesLink.title = "Company features disabled. Enable in Settings.";
        } else {
            invoicesLink.removeAttribute('title');
        }
    }

    // Redirect user if they are currently on a restricted tab
    if (!hasCompany && (currentTab === 'business' || currentTab === 'invoices')) {
        switchTab('dashboard-tab');
        showToast('Access restricted. Company features are disabled.', 'warning');
    }
    
    // 2. Dashboard cards: Net Business Value & Invoice Ledger
    const businessCard = document.getElementById('card-wrapper-business');
    const invoicesCard = document.getElementById('card-wrapper-invoices');
    
    if (businessCard) {
        businessCard.classList.toggle('disabled', !hasCompany);
    }
    if (invoicesCard) {
        invoicesCard.classList.toggle('disabled', !hasCompany);
    }
    
    // 3. Segment dropdown selector items
    const businessSegmentBtn = document.querySelector('.segment-menu-item[data-segment="business"]');
    if (businessSegmentBtn) {
        businessSegmentBtn.classList.toggle('disabled', !hasCompany);
    }
    
    if (!hasCompany && currentDashboardSegment === 'business') {
        currentDashboardSegment = 'all';
        document.querySelectorAll('.segment-menu-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-segment') === 'all');
        });
        const titleMap = {
            'all': 'Financial Dashboard',
            'personal': 'Personal Dashboard',
            'investments': 'Investments Dashboard'
        };
        document.getElementById('page-title').textContent = titleMap['all'];
        renderDashboardStats();
    }
    
    // 4. Reports Engine selector options
    const reportSegmentSelect = document.getElementById('report-segment');
    if (reportSegmentSelect) {
        const optAll = reportSegmentSelect.querySelector('option[value="all"]');
        const optBusiness = reportSegmentSelect.querySelector('option[value="business"]');
        
        if (optAll) optAll.disabled = !hasCompany;
        if (optBusiness) optBusiness.disabled = !hasCompany;
        
        // If hasCompany is false, force report segment to personal
        if (!hasCompany) {
            reportSegmentSelect.value = 'personal';
        }
    }
}

// Clear all business finance, business expenses, and invoices in database
async function clearAllBusinessData(userId) {
    if (!userId) return;
    try {
        // 1. Fetch all business finance records
        const busFinances = await pb.collection('VRTPOCKET_BUSINESS_FINANCE_DATABASE').getFullList({
            filter: `user = "${userId}"`
        }).catch(() => []);
        
        // 2. Fetch all business expenses records
        const busExpenses = await pb.collection('VRTPOCKET_BUSINESS_EXPENSES_DATABASE').getFullList({
            filter: `user = "${userId}"`
        }).catch(() => []);
        
        // 3. Fetch all invoices records
        const invoices = await pb.collection('VRTPOCKET_INVOICE_DATABASE').getFullList({
            filter: `user = "${userId}"`
        }).catch(() => []);
        
        // 4. Batch delete in parallel
        const deletePromises = [];
        
        busFinances.forEach(r => {
            deletePromises.push(pb.collection('VRTPOCKET_BUSINESS_FINANCE_DATABASE').delete(r.id));
        });
        
        busExpenses.forEach(r => {
            deletePromises.push(pb.collection('VRTPOCKET_BUSINESS_EXPENSES_DATABASE').delete(r.id));
        });
        
        invoices.forEach(r => {
            deletePromises.push(pb.collection('VRTPOCKET_INVOICE_DATABASE').delete(r.id));
        });
        
        if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
            console.log(`Cleared ${deletePromises.length} business-related records for user ${userId}.`);
        }
    } catch (err) {
        console.error("Error in clearAllBusinessData:", err);
        throw err;
    }
}

// ==================== FETCH INVOICE TEMPLATE SYSTEM ====================
function openInvoiceFetchModal() {
    const listBody = document.getElementById('invoice-fetch-list-body');
    const searchInput = document.getElementById('invoice-fetch-search-input');
    
    if (listBody && searchInput) {
        listBody.innerHTML = '';
        searchInput.value = '';
        renderFetchInvoiceList(appData.invoices);
        document.getElementById('invoice-fetch-modal').classList.remove('hidden');
    }
}

function renderFetchInvoiceList(invoicesList) {
    const listBody = document.getElementById('invoice-fetch-list-body');
    if (!listBody) return;
    listBody.innerHTML = '';
    
    if (!invoicesList || invoicesList.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 1rem;">No previous invoices found.</td></tr>`;
        return;
    }
    
    invoicesList.forEach(inv => {
        listBody.innerHTML += `
            <tr style="cursor: pointer;" onclick="previewInvoicePopup('${inv.id}')">
                <td><strong>${inv.invoice_number}</strong></td>
                <td>${inv.client_name}</td>
                <td class="text-right font-bold">${formatVal(inv.total_amount)}</td>
                <td class="text-right" style="display: flex; gap: 0.25rem; justify-content: flex-end; align-items: center; border: none;">
                    <button type="button" class="btn btn-xs btn-outline" onclick="event.stopPropagation(); previewInvoicePopup('${inv.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;"><i class="fa-regular fa-eye"></i> View</button>
                    <button type="button" class="btn btn-xs btn-primary" onclick="event.stopPropagation(); autofillInvoiceFromTemplate('${inv.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;">Select</button>
                </td>
            </tr>
        `;
    });
}

function autofillInvoiceFromTemplate(id) {
    const inv = appData.invoices.find(item => item.id === id);
    if (!inv) return;
    
    // Populate client details
    document.getElementById('invoice-client-name').value = inv.client_name || '';
    document.getElementById('invoice-client-email').value = inv.client_email || '';
    document.getElementById('invoice-client-address').value = inv.client_address || '';
    
    // Populate settings (do not overwrite status)
    document.getElementById('invoice-tax').value = inv.tax_rate !== undefined ? inv.tax_rate : 0;
    document.getElementById('invoice-discount').value = inv.discount !== undefined ? inv.discount : 0;
    
    // Extract notes and payment details (splitting if delimiter is found)
    let notesText = inv.notes || '';
    let paymentDetailsText = inv.payment_details || '';
    const delimiter = "\n---PAYMENT-DETAILS---\n";
    if (notesText.includes(delimiter)) {
        const parts = notesText.split(delimiter);
        notesText = parts[0] || '';
        paymentDetailsText = parts[1] || '';
    }
    
    document.getElementById('invoice-notes').value = notesText;
    document.getElementById('invoice-payment-details').value = paymentDetailsText || inv.payment_details || '';
    
    // Load dynamic items
    const container = document.getElementById('invoice-items-rows-container');
    if (container) {
        container.innerHTML = '';
        
        const items = Array.isArray(inv.items) ? inv.items : [];
        if (items.length === 0) {
            addInvoiceItemRow();
        } else {
            items.forEach(it => {
                addInvoiceItemRow(it.desc, it.qty, it.price, it.subItems);
            });
        }
    }
    
    // Recalculate totals
    calculateInvoiceTotals();
    
    // Close modal
    document.getElementById('invoice-fetch-modal').classList.add('hidden');
    showToast(`Autofilled data from Invoice ${inv.invoice_number}!`, 'success');
}

let currentPreviewInvoiceId = null;

function previewInvoicePopup(id) {
    const inv = appData.invoices.find(item => item.id === id);
    if (!inv) return;
    
    currentPreviewInvoiceId = id;
    
    // Company Info
    document.getElementById('popup-invoice-paper-company-name').textContent = currentUser.company_name || 'My Organization';
    document.getElementById('popup-invoice-paper-company-address').textContent = currentUser.company_address || '';
    document.getElementById('popup-invoice-paper-company-contact').textContent = `Tel: ${currentUser.company_phone || 'N/A'} | Email: ${currentUser.company_email || currentUser.email}`;

    // Set Company Logo
    const printLogo = document.getElementById('popup-invoice-paper-logo');
    if (printLogo) {
        if (currentUser.company_logo) {
            printLogo.src = pb.files.getUrl(currentUser, currentUser.company_logo);
            printLogo.classList.remove('hidden');
        } else {
            printLogo.classList.add('hidden');
        }
    }

    // Invoice Meta
    document.getElementById('popup-invoice-paper-number').textContent = inv.invoice_number;
    document.getElementById('popup-invoice-paper-issue-date').textContent = formatDateToDMY(inv.issue_date);
    document.getElementById('popup-invoice-paper-due-date').textContent = formatDateToDMY(inv.due_date);
    
    const statusBadge = document.getElementById('popup-invoice-paper-status');
    if (statusBadge) {
        statusBadge.textContent = inv.status;
        statusBadge.className = `badge status-${inv.status.toLowerCase()}`;
    }

    // Client info
    document.getElementById('popup-invoice-paper-client-name').textContent = inv.client_name;
    document.getElementById('popup-invoice-paper-client-address').textContent = inv.client_address || '';
    document.getElementById('popup-invoice-paper-client-email').textContent = inv.client_email || '';

    // Fill Items Table
    const tableBody = document.getElementById('popup-invoice-paper-items-list');
    if (tableBody) {
        tableBody.innerHTML = '';
        
        const items = Array.isArray(inv.items) ? inv.items : [];
        let subtotal = 0;
        
        items.forEach(it => {
            const displayTotal = it.qty * it.price;
            const subTotalSum = Array.isArray(it.subItems) ? it.subItems.reduce((acc, sub) => acc + (sub.total || 0), 0) : 0;
            const actualTotal = displayTotal + subTotalSum;
            subtotal += actualTotal;
            
            tableBody.innerHTML += `
                <tr style="border-bottom: 1px dashed var(--border-glass);">
                    <td style="padding: 0.5rem 0.25rem;"><strong>${it.desc}</strong></td>
                    <td class="text-right" style="padding: 0.5rem 0.25rem; text-align: right;">${it.qty}</td>
                    <td class="text-right" style="padding: 0.5rem 0.25rem; text-align: right;">${formatVal(it.price)}</td>
                    <td class="text-right font-bold" style="padding: 0.5rem 0.25rem; text-align: right; font-weight: 700;">${formatVal(displayTotal)}</td>
                </tr>
            `;

            if (Array.isArray(it.subItems)) {
                it.subItems.forEach(sub => {
                    const subQtyStr = sub.hasPrice ? `${sub.qty}` : '';
                    const subPriceStr = sub.hasPrice ? `${formatVal(sub.price)}` : '';
                    const subTotalStr = sub.hasPrice ? `${formatVal(sub.total)}` : '';
                    
                    tableBody.innerHTML += `
                        <tr class="sub-item-paper-row" style="background: rgba(255, 255, 255, 0.01);">
                            <td style="padding: 0.35rem 0.25rem 0.35rem 1.5rem; color: var(--text-secondary); font-size: 0.8rem;">
                                <i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right: 0.5rem; color: var(--text-muted); font-size: 0.7rem;"></i>
                                ${sub.desc}
                            </td>
                            <td class="text-right" style="padding: 0.35rem 0.25rem; text-align: right; color: var(--text-secondary); font-size: 0.8rem;">${subQtyStr}</td>
                            <td class="text-right" style="padding: 0.35rem 0.25rem; text-align: right; color: var(--text-secondary); font-size: 0.8rem;">${subPriceStr}</td>
                            <td class="text-right" style="padding: 0.35rem 0.25rem; text-align: right; color: var(--text-secondary); font-size: 0.8rem; font-weight: 500;">${subTotalStr}</td>
                        </tr>
                    `;
                });
            }
        });

        // Totals maths
        const taxVal = subtotal * (inv.tax_rate / 100);
        document.getElementById('popup-invoice-paper-subtotal').textContent = formatVal(subtotal);
        document.getElementById('popup-invoice-paper-tax').textContent = `${formatVal(taxVal)} (${inv.tax_rate}%)`;
        document.getElementById('popup-invoice-paper-discount').textContent = `-${formatVal(inv.discount)}`;
        document.getElementById('popup-invoice-paper-total').textContent = formatVal(subtotal + taxVal - inv.discount);
    }

    // Memo and payment details
    let notesText = inv.notes || '';
    let paymentDetailsText = inv.payment_details || '';

    const delimiter = "\n---PAYMENT-DETAILS---\n";
    if (notesText.includes(delimiter)) {
        const parts = notesText.split(delimiter);
        notesText = parts[0] || '';
        paymentDetailsText = parts[1] || '';
    }

    const pDetailsText = document.getElementById('popup-invoice-paper-payment-details-text');
    const pDetailsBox = document.getElementById('popup-invoice-paper-payment-details-box');
    
    if (pDetailsText && pDetailsBox) {
        if (paymentDetailsText && paymentDetailsText.trim() !== '') {
            pDetailsText.textContent = paymentDetailsText;
            pDetailsBox.classList.remove('hidden');
        } else {
            pDetailsText.textContent = '';
            pDetailsBox.classList.add('hidden');
        }
    }

    const notesTextBox = document.getElementById('popup-invoice-paper-notes-text');
    if (notesTextBox) {
        notesTextBox.textContent = notesText || 'Thank you for your business!';
    }

    // Show popup modal
    document.getElementById('invoice-preview-popup-modal').classList.remove('hidden');
}

// ==================== FETCH CLIENT DATA SYSTEM ====================
function getDeduplicatedClients() {
    const clientsMap = {};
    appData.invoices.forEach(inv => {
        const name = (inv.client_name || '').trim();
        const email = (inv.client_email || '').trim();
        const address = (inv.client_address || '').trim();
        
        if (!name) return;
        
        const key = `${name.toLowerCase()}||${email.toLowerCase()}||${address.toLowerCase()}`;
        
        if (!clientsMap[key]) {
            clientsMap[key] = {
                name: inv.client_name,
                email: inv.client_email || '',
                address: inv.client_address || ''
            };
        }
    });
    return Object.values(clientsMap);
}

function openInvoiceClientFetchModal() {
    const listBody = document.getElementById('invoice-client-fetch-list-body');
    const searchInput = document.getElementById('invoice-client-search-input');
    
    if (listBody && searchInput) {
        listBody.innerHTML = '';
        searchInput.value = '';
        const clients = getDeduplicatedClients();
        renderFetchClientList(clients);
        document.getElementById('invoice-client-fetch-modal').classList.remove('hidden');
    }
}

function renderFetchClientList(clientsList) {
    const listBody = document.getElementById('invoice-client-fetch-list-body');
    if (!listBody) return;
    listBody.innerHTML = '';
    
    if (!clientsList || clientsList.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 1rem;">No clients found.</td></tr>`;
        return;
    }
    
    clientsList.forEach((client, idx) => {
        listBody.innerHTML += `
            <tr style="cursor: pointer;" onclick="selectClientFromTemplate(${idx})">
                <td><strong>${client.name}</strong></td>
                <td>${client.email || 'N/A'}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${client.address || 'N/A'}</td>
                <td class="text-right">
                    <button type="button" class="btn btn-xs btn-primary" onclick="event.stopPropagation(); selectClientFromTemplate(${idx})" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;">Select</button>
                </td>
            </tr>
        `;
    });
    
    window.currentClientFetchPool = clientsList;
}

function selectClientFromTemplate(index) {
    if (!window.currentClientFetchPool || !window.currentClientFetchPool[index]) return;
    const client = window.currentClientFetchPool[index];
    
    document.getElementById('invoice-client-name').value = client.name;
    document.getElementById('invoice-client-email').value = client.email;
    document.getElementById('invoice-client-address').value = client.address;
    
    document.getElementById('invoice-client-fetch-modal').classList.add('hidden');
    showToast(`Client ${client.name} loaded successfully!`, 'success');
}
