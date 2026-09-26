/**
 * FranchiseEdge - AngularJS 1.8 Application Core
 * Communicates strictly with the native Node.js HTTP API and MongoDB via $http.
 */

var app = angular.module('franchiseApp', ['ngAnimate', 'ngRoute']);

app.service('ApiService', ['$http', function ($http) {
    this.request = function (method, endpoint, data) {
        return $http({ method: method, url: '/api/' + endpoint, data: data });
    };
}]);

// =========================================================================
// 1. SERVICES
// =========================================================================

// Franchise Service
app.service('FranchiseService', ['$http', function ($http) {
    this.getAll = function () {
        return $http.get('/api/franchises');
    };
    this.getById = function (id) {
        return $http.get('/api/franchises/' + id);
    };
    this.create = function (data) {
        return $http.post('/api/franchises', data);
    };
    this.update = function (id, data) {
        return $http.put('/api/franchises/' + id, data);
    };
    this.remove = function (id) {
        return $http.delete('/api/franchises/' + id);
    };
}]);

// Product Service
app.service('ProductService', ['$http', function ($http) {
    this.getAll = function () {
        return $http.get('/api/products');
    };
    this.getById = function (id) {
        return $http.get('/api/products/' + id);
    };
    this.create = function (data) {
        return $http.post('/api/products', data);
    };
    this.update = function (id, data) {
        return $http.put('/api/products/' + id, data);
    };
    this.remove = function (id) {
        return $http.delete('/api/products/' + id);
    };
}]);

// Inventory Service
app.service('InventoryService', ['$http', function ($http) {
    this.getAll = function () {
        return $http.get('/api/inventory');
    };
    this.getByFranchise = function (franchiseId) {
        return $http.get('/api/inventory/franchise/' + franchiseId);
    };
    this.create = function (data) {
        return $http.post('/api/inventory', data);
    };
    this.update = function (id, data) {
        return $http.put('/api/inventory/' + id, data);
    };
    this.stockIn = function (data) {
        return $http.post('/api/inventory/stock-in', data);
    };
    this.stockOut = function (data) {
        return $http.post('/api/inventory/stock-out', data);
    };
}]);

// Order Service
app.service('OrderService', ['$http', function ($http) {
    this.getAll = function () {
        return $http.get('/api/orders');
    };
    this.getById = function (id) {
        return $http.get('/api/orders/' + id);
    };
    this.create = function (data) {
        return $http.post('/api/orders', data);
    };
    this.update = function (id, data) {
        return $http.put('/api/orders/' + id, data);
    };
    this.updateStatus = function (id, status) {
        return $http.put('/api/orders/' + id + '/status', { status: status });
    };
    this.remove = function (id) {
        return $http.delete('/api/orders/' + id);
    };
}]);

// Dashboard Service
app.service('DashboardService', ['$http', function ($http) {
    this.getStats = function () {
        return $http.get('/api/dashboard');
    };
}]);

// Auth Service keeps only the active UI state; records are verified by the API.
app.service('AuthService', ['$http', '$window', function ($http, $window) {
    var currentUser = null;
    var authenticated = false;

    this.validateEmail = function (email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    /**
     * Validates an Indian mobile number.
     * Accepts exactly 10 digits starting with 6, 7, 8 or 9.
     * The value may optionally be stored/sent as +91XXXXXXXXXX.
     * Returns true if valid, false otherwise.
     */
    this.validateIndianPhone = function (phone) {
        if (!phone && phone !== 0) return false; // empty is invalid when called from validation
        var digits = String(phone).replace(/^\+91/, '').replace(/[\s\-]/g, '');
        return /^[6-9][0-9]{9}$/.test(digits);
    };

    /**
     * Convenience: returns the 10-digit number stripped of +91 prefix/spaces.
     */
    this.normalizeIndianPhone = function (phone) {
        if (!phone) return '';
        return String(phone).replace(/^\+91/, '').replace(/[\s\-]/g, '');
    };

    this.login = function (email, password) {
        return $http.post('/api/auth/company-login', { email: email, password: password })
            .then(function (response) {
                if (response.data && response.data.success) { currentUser = response.data.user; authenticated = true; return response.data; }
                return { success: false, message: response.data.message };
            });
    };
    this.adminLogin = function (email, password) { return $http.post('/api/auth/admin-login', { email: email, password: password }).then(function (response) { if (response.data && response.data.success) { currentUser = response.data.user; authenticated = true; return response.data; } return { success: false, message: response.data.message }; }); };

    this.register = function (formData) {
        return $http.post('/api/auth/register', formData)
            .then(function (response) {
                if (response.data && response.data.success) { return response.data; }
                return { success: false, message: response.data.message };
            });
    };

    this.getCurrentUser = function () {
        return currentUser;
    };

    this.isLoggedIn = function () {
        return authenticated;
    };

    this.restore = function () { return $http.post('/api/auth/me').then(function (response) { currentUser = response.data.user; authenticated = true; return currentUser; }); };
    this.requireAuth = function () { return authenticated; };

    this.logout = function () {
        $http.post('/api/auth/logout').finally(function () { authenticated = false; currentUser = null; $window.location.href = 'index.html'; });
    };
}]);

app.service('AdminService', ['$http', function ($http) {
    this.dashboard = function () { return $http.get('/api/admin/dashboard'); };
    this.companies = function (status) { return $http.get('/api/admin/companies' + (status ? '?status=' + status : '')); };
    this.approve = function (id) { return $http.post('/api/admin/companies/' + id + '/approve'); };
    this.reject = function (id, reason) { return $http.post('/api/admin/companies/' + id + '/reject', { reason: reason }); };
    this.detail = function (id) { return $http.get('/api/admin/companies/' + id); };
    this.settings = function () { return $http.get('/api/admin/settings'); };
    this.changePassword = function (data) { return $http.post('/api/admin/change-password', data); };
}]);

app.service('CompanyService', ['$http', function ($http) {
    this.setup = function () { return $http.get('/api/company/setup'); };
    this.saveSetup = function (data) { return $http.put('/api/company/setup', data); };
}]);
app.service('ProfileService', ['$http', function ($http) {
    this.get = function () { return $http.get('/api/profile'); };
    this.update = function (data) { return $http.put('/api/profile', data); };
    this.changePassword = function (data) { return $http.post('/api/profile/change-password', data); };
}]);

// Date Time Service
app.service('DateTimeService', ['$interval', function ($interval) {
    var currentDate = new Date();
    $interval(function () { currentDate = new Date(); }, 1000);
    this.getDate = function () { return currentDate; };
}]);

// =========================================================================
// 2. FILTERS
// =========================================================================

app.filter('currencyInr', [function () {
    return function (input) {
        if (input === null || input === undefined || isNaN(input)) return '₹0';
        return '₹' + Number(input).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };
}]);

app.filter('statusClass', [function () {
    return function (status) {
        var map = {
            ACTIVE: 'active', PENDING: 'pending', INACTIVE: 'inactive',
            COMPLETED: 'active', DELIVERED: 'active', 'IN TRANSIT': 'pending', CANCELLED: 'suspended'
        };
        return map[status] || 'pending';
    };
}]);

app.filter('stockStatus', [function () {
    return function (quantity, reorderLevel) {
        var q = parseInt(quantity, 10) || 0;
        var r = parseInt(reorderLevel, 10) || 10;
        if (q <= 0) return 'Out of Stock';
        if (q <= r) return 'Low Stock';
        return 'Healthy';
    };
}]);

app.filter('tipPriority', [function () {
    return function (tips, priority) {
        if (!tips || !angular.isArray(tips)) return [];
        if (!priority) return tips;
        return tips.filter(function (t) { return t.priority === priority; });
    };
}]);

// =========================================================================
// 3. DIRECTIVES
// =========================================================================

/**
 * phoneInput directive
 * Usage:  <phone-input ng-model="someModel.phone" ph-error="someModel.phoneError"></phone-input>
 * Renders:  🇮🇳 +91  [10-digit input]
 * - Strips/adds +91 prefix transparently via ngModel
 * - Enforces maxlength=10 and digits-only keypress
 * - Sets ph-error to the error string when invalid, '' when valid
 */
app.directive('phoneInput', [function () {
    return {
        restrict: 'E',
        require: 'ngModel',
        scope: {
            phError: '='
        },
        template:
            '<div class="phone-input-wrapper">' +
              '<span class="phone-prefix-badge"><span class="flag-emoji">&#x1F1EE;&#x1F1F3;</span> +91</span>' +
              '<input type="tel" class="phone-digit-input" maxlength="10" placeholder="Enter 10-digit mobile number" />' +
            '</div>' +
            '<span class="error-text" ng-if="phError">{{ phError }}</span>',
        link: function (scope, element, attrs, ngModel) {
            var input = element.find('input')[0];

            /* --- Write: model → view --- */
            ngModel.$render = function () {
                var raw = ngModel.$viewValue || '';
                // Strip leading +91 / 91 for display
                raw = String(raw).replace(/^\+?91/, '').replace(/[\s\-]/g, '');
                input.value = raw.slice(0, 10);
            };

            /* --- Read: view → model --- */
            function update() {
                var digits = input.value.replace(/\D/g, '').slice(0, 10);
                input.value = digits; // keep field clean
                ngModel.$setViewValue(digits);
                validate(digits);
            }

            function validate(digits) {
                var valid = /^[6-9][0-9]{9}$/.test(digits);
                ngModel.$setValidity('indianPhone', valid || digits === '');
                if (digits !== '' && !valid) {
                    scope.phError = 'Enter a valid 10-digit Indian mobile number.';
                } else {
                    scope.phError = '';
                }
            }

            /* --- Block non-digit keys --- */
            input.addEventListener('keypress', function (e) {
                if (!/[0-9]/.test(e.key)) e.preventDefault();
            });

            input.addEventListener('input', function () {
                scope.$apply(update);
            });

            input.addEventListener('blur', function () {
                scope.$apply(function () {
                    var digits = input.value;
                    if (digits && !/^[6-9][0-9]{9}$/.test(digits)) {
                        scope.phError = 'Enter a valid 10-digit Indian mobile number.';
                    }
                });
            });
        }
    };
}]);

app.directive('franchiseStatus', [function () {
    return {
        restrict: 'E',
        scope: { status: '@' },
        template: '<span class="status" ng-class="{\'active\': status===\'ACTIVE\'||status===\'COMPLETED\'||status===\'DELIVERED\', \'pending\': status===\'PENDING\'||status===\'IN TRANSIT\', \'suspended\': status===\'INACTIVE\'||status===\'CANCELLED\'}" ng-bind="status"></span>'
    };
}]);

app.directive('franchiseHighlight', [function () {
    return {
        restrict: 'A',
        link: function (scope, element) {
            element.on('mouseenter', function () { element.addClass('franchise-highlight'); });
            element.on('mouseleave', function () { element.removeClass('franchise-highlight'); });
            scope.$on('$destroy', function () {
                element.off('mouseenter');
                element.off('mouseleave');
            });
        }
    };
}]);

app.directive('stockStatus', [function () {
    return {
        restrict: 'E',
        scope: { quantity: '=', reorder: '=' },
        template: '<span class="badge" ng-class="{\'badge-danger\': quantity<=reorder, \'badge-success\': quantity>reorder}">' +
                  '{{ quantity <= reorder ? "Low Stock (" + quantity + ")" : "Healthy (" + quantity + ")" }}' +
                  '</span>'
    };
}]);

app.directive('appLoading', [function () {
    return {
        restrict: 'E',
        scope: { loading: '=' },
        template: '<div class="loading-overlay" ng-if="loading">' +
                  '  <div class="spinner"></div>' +
                  '  <p>Synchronizing with MongoDB...</p>' +
                  '</div>'
    };
}]);

app.directive('tipCard', [function () {
    return {
        restrict: 'E',
        scope: { franchise: '=', tips: '=' },
        template:
            '<div class="tip-card">' +
                '<div class="tip-card-header">' +
                    '<h3>{{ franchise.name }}</h3>' +
                    '<span><i class="fa-solid fa-location-dot"></i> {{ franchise.city || franchise.location }}</span>' +
                '</div>' +
                '<div class="tip-card-body">' +
                    '<div class="tip-item" ng-repeat="tip in tips" ng-class="\'tip-priority-\' + tip.priority">' +
                        '<div class="tip-icon"><i class="fa-solid fa-lightbulb"></i></div>' +
                        '<div><strong>{{ tip.title }}</strong>' +
                        '<p class="tip-desc">{{ tip.description }}</p></div>' +
                    '</div>' +
                '</div>' +
            '</div>'
    };
}]);

app.directive('confirmAction', [function () {
    return { restrict: 'A', link: function (scope, element, attributes) {
        element.on('click', function (event) { if (!window.confirm(attributes.confirmAction || 'Continue?')) event.stopImmediatePropagation(); });
        scope.$on('$destroy', function () { element.off('click'); });
    }};
}]);

app.directive('formField', [function () {
    return { restrict: 'A', link: function (scope, element, attributes) {
        element.attr('aria-label', attributes.formField || element.attr('name') || 'Form field');
    }};
}]);

// =========================================================================
// 4. CONTROLLERS
// =========================================================================

// Login Controller
app.controller('LoginController', ['$scope', '$window', 'AuthService', function ($scope, $window, AuthService) {
    $scope.credentials = { email: '', password: '', remember: false };
    $scope.errors = {};
    $scope.loginError = '';
    $scope.isLoading = false;

    $scope.login = function () {
        $scope.errors = {};
        $scope.loginError = '';
        if (!$scope.credentials.email || !AuthService.validateEmail($scope.credentials.email)) {
            $scope.errors.email = 'Please enter a valid corporate email.';
            return;
        }
        if (!$scope.credentials.password) {
            $scope.errors.password = 'Password is required.';
            return;
        }

        $scope.isLoading = true;
        AuthService.login($scope.credentials.email, $scope.credentials.password)
            .then(function (res) {
                $scope.isLoading = false;
                if (res.success) {
                    $window.location.href = res.setupRequired ? 'company-setup.html' : 'dashboard.html';
                } else {
                    $scope.loginError = res.message || 'Authentication failed.';
                }
            })
            .catch(function (err) {
                $scope.isLoading = false;
                $scope.loginError = (err.data && err.data.message) || 'Unable to connect to backend server.';
            });
    };
}]);

app.controller('AdminLoginController', ['$scope', '$window', 'AuthService', function ($scope, $window, AuthService) {
    $scope.credentials = {}; $scope.login = function () { $scope.loginError = ''; AuthService.adminLogin($scope.credentials.email, $scope.credentials.password).then(function (result) { if (result.success) $window.location.href = 'admin-dashboard.html'; else $scope.loginError = result.message; }).catch(function (error) { $scope.loginError = error.data && error.data.message || 'Unable to sign in.'; }); };
}]);

app.controller('AdminDashboardController', ['$scope', 'AdminService', 'AuthService', function ($scope, AdminService, AuthService) {
    $scope.stats = {};
    $scope.pendingList = [];
    $scope.approvedList = [];
    $scope.targetCompany = null;
    $scope.showRejectModal = false;
    $scope.rejectReason = '';

    $scope.loadData = function () {
        AdminService.dashboard().then(function (r) {
            $scope.stats = r.data.data || {};
        });
        AdminService.companies('PENDING').then(function (r) {
            $scope.pendingList = r.data.data || [];
        });
        AdminService.companies('APPROVED').then(function (r) {
            $scope.approvedList = r.data.data || [];
        });
    };

    $scope.approveCompany = function (id) {
        AdminService.approve(id).then(function () {
            $scope.loadData();
        });
    };

    $scope.openRejectModal = function (company) {
        $scope.targetCompany = company;
        $scope.rejectReason = '';
        $scope.showRejectModal = true;
    };

    $scope.confirmReject = function () {
        if (!$scope.targetCompany || !$scope.rejectReason.trim()) return;
        AdminService.reject($scope.targetCompany.id, $scope.rejectReason.trim()).then(function () {
            $scope.showRejectModal = false;
            $scope.loadData();
        });
    };

    $scope.logout = function () {
        AuthService.logout();
    };

    $scope.loadData();
}]);

app.controller('AdminCompaniesController', ['$scope', '$window', 'AdminService', 'AuthService', function ($scope, $window, AdminService, AuthService) {
    var initialParam = new URLSearchParams($window.location.search).get('status');
    $scope.status = initialParam ? initialParam.toUpperCase() : '';
    $scope.searchTerm = '';
    $scope.companies = [];
    $scope.counts = { all: 0, pending: 0, approved: 0, rejected: 0 };
    $scope.pageTitle = 'Company Requests';
    $scope.actionSuccess = '';
    $scope.actionError = '';
    $scope.showRejectModal = false;
    $scope.targetCompany = null;
    $scope.rejectReason = '';

    $scope.updateTitle = function () {
        if ($scope.status === 'PENDING') $scope.pageTitle = 'Pending Companies';
        else if ($scope.status === 'APPROVED') $scope.pageTitle = 'Approved Companies';
        else if ($scope.status === 'REJECTED') $scope.pageTitle = 'Rejected Companies';
        else $scope.pageTitle = 'Company Requests & Management';
    };

    $scope.loadCounts = function () {
        AdminService.companies('').then(function (r) {
            var list = r.data.data || [];
            var pending = 0, approved = 0, rejected = 0;
            angular.forEach(list, function (c) {
                if (c.status === 'PENDING') pending++;
                else if (c.status === 'APPROVED') approved++;
                else if (c.status === 'REJECTED') rejected++;
            });
            $scope.counts = { all: list.length, pending: pending, approved: approved, rejected: rejected };
        });
    };

    $scope.load = function () {
        $scope.actionSuccess = '';
        $scope.actionError = '';
        var queryStatus = ($scope.status === '' || $scope.status === 'ALL') ? '' : $scope.status;
        AdminService.companies(queryStatus).then(function (r) {
            $scope.companies = r.data.data || [];
        });
    };

    $scope.setStatus = function (st) {
        $scope.status = st || '';
        $scope.updateTitle();
        $scope.load();
    };

    $scope.approve = function (id) {
        $scope.actionSuccess = '';
        $scope.actionError = '';
        AdminService.approve(id)
            .then(function (res) {
                $scope.actionSuccess = res.data.message || 'Company approved successfully.';
                $scope.load();
                $scope.loadCounts();
            })
            .catch(function (err) {
                $scope.actionError = (err.data && err.data.message) || 'Failed to approve company.';
            });
    };

    $scope.openRejectModal = function (company) {
        $scope.targetCompany = company;
        $scope.rejectReason = '';
        $scope.showRejectModal = true;
    };

    $scope.closeRejectModal = function () {
        $scope.showRejectModal = false;
        $scope.targetCompany = null;
    };

    $scope.confirmReject = function () {
        if (!$scope.targetCompany || !$scope.rejectReason.trim()) return;
        $scope.actionSuccess = '';
        $scope.actionError = '';
        AdminService.reject($scope.targetCompany.id, $scope.rejectReason.trim())
            .then(function (res) {
                $scope.actionSuccess = 'Company access request rejected.';
                $scope.showRejectModal = false;
                $scope.load();
                $scope.loadCounts();
            })
            .catch(function (err) {
                $scope.actionError = (err.data && err.data.message) || 'Failed to reject company.';
            });
    };

    $scope.logout = function () {
        AuthService.logout();
    };

    $scope.updateTitle();
    $scope.loadCounts();
    $scope.load();
}]);

app.controller('AdminCompanyDetailController', ['$scope', '$window', 'AdminService', 'AuthService', function ($scope, $window, AdminService, AuthService) {
    var id = new URLSearchParams($window.location.search).get('id');
    $scope.company = {};
    $scope.actionSuccess = '';
    $scope.actionError = '';
    $scope.showRejectModal = false;
    $scope.rejectReason = '';

    $scope.load = function () {
        if (id) {
            AdminService.detail(id).then(function (r) {
                $scope.company = r.data.data || {};
            });
        }
    };

    $scope.approveCompany = function (companyId) {
        $scope.actionSuccess = '';
        $scope.actionError = '';
        AdminService.approve(companyId || id)
            .then(function (res) {
                $scope.actionSuccess = res.data.message || 'Company approved successfully.';
                $scope.load();
            })
            .catch(function (err) {
                $scope.actionError = (err.data && err.data.message) || 'Failed to approve company.';
            });
    };

    $scope.openRejectModal = function () {
        $scope.rejectReason = '';
        $scope.showRejectModal = true;
    };

    $scope.confirmReject = function () {
        if (!$scope.rejectReason.trim()) return;
        $scope.actionSuccess = '';
        $scope.actionError = '';
        AdminService.reject(id, $scope.rejectReason.trim())
            .then(function (res) {
                $scope.actionSuccess = 'Company request rejected.';
                $scope.showRejectModal = false;
                $scope.load();
            })
            .catch(function (err) {
                $scope.actionError = (err.data && err.data.message) || 'Failed to reject company.';
            });
    };

    $scope.logout = function () {
        AuthService.logout();
    };

    $scope.load();
}]);

app.controller('AdminSettingsController', ['$scope', 'AdminService', 'AuthService', function ($scope, AdminService, AuthService) {
    $scope.admin = {};
    $scope.system = {};
    $scope.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    $scope.message = '';
    $scope.error = '';

    $scope.load = function () {
        AdminService.settings().then(function (r) {
            if (r.data && r.data.data) {
                $scope.admin = r.data.data.admin;
                $scope.system = r.data.data.system;
            }
        });
    };

    $scope.changePassword = function () {
        $scope.message = '';
        $scope.error = '';
        if ($scope.passwordForm.newPassword !== $scope.passwordForm.confirmPassword) {
            $scope.error = 'New password confirmation does not match.';
            return;
        }
        AdminService.changePassword($scope.passwordForm)
            .then(function (res) {
                $scope.message = res.data.message || 'Admin credentials updated successfully.';
                $scope.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
            })
            .catch(function (err) {
                $scope.error = (err.data && err.data.message) || 'Failed to update credentials.';
            });
    };

    $scope.logout = function () {
        AuthService.logout();
    };

    $scope.load();
}]);

// Register Controller
app.controller('RegisterController', ['$scope', '$window', 'AuthService', function ($scope, $window, AuthService) {
    $scope.form = { name: '', company: '', email: '', phone: '', address: '', password: '', confirmPassword: '' };
    $scope.errors = {};
    $scope.registerError = '';
    $scope.isLoading = false;

    $scope.register = function () {
        $scope.errors = {};
        $scope.registerError = '';

        if (!$scope.form.name) $scope.errors.name = 'Full name is required.';
        if (!$scope.form.company) $scope.errors.company = 'Company name is required.';
        if (!$scope.form.email || !AuthService.validateEmail($scope.form.email)) $scope.errors.email = 'Valid corporate email required.';
        if ($scope.form.phone && !AuthService.validateIndianPhone($scope.form.phone)) {
            $scope.errors.phone = 'Enter a valid 10-digit Indian mobile number.';
        }
        if (!$scope.form.password || $scope.form.password.length < 6) $scope.errors.password = 'Password must be at least 6 characters.';
        if ($scope.form.password !== $scope.form.confirmPassword) $scope.errors.confirmPassword = 'Passwords do not match.';

        if (Object.keys($scope.errors).length) return;

        $scope.isLoading = true;
        AuthService.register($scope.form)
            .then(function (res) {
                $scope.isLoading = false;
                if (res.success) {
                    $window.location.href = 'login.html?registered=pending';
                } else {
                    $scope.registerError = res.message || 'Registration failed.';
                }
            })
            .catch(function (err) {
                $scope.isLoading = false;
                $scope.registerError = (err.data && err.data.message) || 'Error connecting to database.';
            });
    };
}]);

// Dashboard Controller
app.controller('DashboardController', ['$scope', '$interval', 'DashboardService', 'FranchiseService', 'DateTimeService', 'AuthService', function ($scope, $interval, DashboardService, FranchiseService, DateTimeService, AuthService) {
    $scope.currentUser = AuthService.getCurrentUser();
    if (!$scope.currentUser) {
        AuthService.restore().then(function (u) {
            $scope.currentUser = u;
            if (u && u.company) $scope.company = u.company;
        });
    }
    $scope.company = $scope.currentUser ? $scope.currentUser.company : 'FranchiseEdge HQ';
    $scope.searchText = '';
    $scope.currentDate = DateTimeService.getDate();
    $scope.isLoading = false;
    $scope.stats = {};
    $scope.franchises = [];
    $scope.stockHealth = [];
    $scope.stockHealthSummary = { healthy: 0, low: 0, total: 0, healthyPercent: 0, lowPercent: 0 };
    $scope.stockHealthPieStyle = {};
    $scope.recentOrders = [];

    $interval(function () {
        $scope.currentDate = DateTimeService.getDate();
    }, 1000);

    $scope.loadDashboardData = function () {
        $scope.isLoading = true;
        DashboardService.getStats()
            .then(function (res) {
                $scope.isLoading = false;
                if (res.data && res.data.success) {
                    $scope.stats = res.data.data;
                    $scope.stockHealth = res.data.data.stockHealth || [];
                    $scope.stockHealthSummary = res.data.data.stockHealthSummary || $scope.stockHealthSummary;
                    $scope.stockHealthPieStyle = { background: 'conic-gradient(#16a34a 0 ' + $scope.stockHealthSummary.healthyPercent + '%, #dc2626 ' + $scope.stockHealthSummary.healthyPercent + '% 100%)' };
                    $scope.recentOrders = res.data.data.recentOrders || [];
                }
            })
            .catch(function (err) {
                $scope.isLoading = false;
                console.error('Error loading dashboard stats:', err);
            });

        FranchiseService.getAll()
            .then(function (res) {
                if (res.data && res.data.success) {
                    $scope.franchises = res.data.data;
                }
            });
    };

    $scope.loadDashboardData();

    $scope.logout = function () {
        if (confirm('Are you sure you want to logout?')) {
            AuthService.logout();
        }
    };
}]);

// Franchise Controller
app.controller('FranchiseController', ['$scope', '$interval', 'FranchiseService', 'DateTimeService', 'AuthService', function ($scope, $interval, FranchiseService, DateTimeService, AuthService) {
    $scope.currentUser = AuthService.getCurrentUser();
    if (!$scope.currentUser) {
        AuthService.restore().then(function (u) { $scope.currentUser = u; });
    }
    $scope.viewMode = 'cards';
    $scope.franchises = [];
    $scope.searchText = '';
    $scope.statusFilter = '';
    $scope.currentDate = DateTimeService.getDate();
    $scope.isLoading = false;
    $scope.showModal = false;
    $scope.showViewModal = false;
    $scope.editMode = false;
    $scope.modalTitle = '';
    $scope.formData = {};
    $scope.selectedFranchise = {};

    $interval(function () { $scope.currentDate = DateTimeService.getDate(); }, 1000);

    $scope.loadFranchises = function () {
        $scope.isLoading = true;
        FranchiseService.getAll()
            .then(function (res) {
                $scope.isLoading = false;
                if (res.data && res.data.success) {
                    $scope.franchises = res.data.data;
                    $scope.calculateStats();
                }
            })
            .catch(function (err) {
                $scope.isLoading = false;
                alert('Failed to load franchises from MongoDB.');
            });
    };

    $scope.calculateStats = function () {
        var active = 0, pending = 0, revenue = 0;
        angular.forEach($scope.franchises, function (f) {
            if (f.status === 'ACTIVE') active++;
            if (f.status === 'PENDING') pending++;
            revenue += Number(f.total_revenue || f.revenue) || 0;
        });
        $scope.activeCount = active;
        $scope.pendingCount = pending;
        $scope.totalRevenue = revenue;
    };

    $scope.loadFranchises();

    $scope.openAddModal = function () {
        $scope.editMode = false;
        $scope.modalTitle = 'Register New Franchise Unit';
        $scope.formData = {
            franchise_code: '',
            name: '',
            owner_name: '',
            phone: '',
            email: '',
            address: '',
            city: '',
            state: '',
            status: 'ACTIVE'
        };
        $scope.showModal = true;
    };

    $scope.editFranchise = function (f) {
        $scope.editMode = true;
        $scope.modalTitle = 'Edit Franchise Profile';
        $scope.formData = angular.copy(f);
        $scope.showModal = true;
    };

    $scope.saveFranchise = function () {
        if (!$scope.formData.name || !$scope.formData.owner_name) {
            alert('Franchise Name and Owner Name are required.');
            return;
        }
        if ($scope.formData.phone && !AuthService.validateIndianPhone($scope.formData.phone)) {
            $scope.franchisePhoneError = 'Enter a valid 10-digit Indian mobile number.';
            return;
        }
        $scope.franchisePhoneError = '';

        $scope.isLoading = true;
        if ($scope.editMode) {
            FranchiseService.update($scope.formData.id, $scope.formData)
                .then(function (res) {
                    $scope.isLoading = false;
                    $scope.showModal = false;
                    $scope.loadFranchises();
                })
                .catch(function (err) {
                    $scope.isLoading = false;
                    alert((err.data && err.data.message) || 'Error updating franchise.');
                });
        } else {
            FranchiseService.create($scope.formData)
                .then(function (res) {
                    $scope.isLoading = false;
                    $scope.showModal = false;
                    $scope.loadFranchises();
                })
                .catch(function (err) {
                    $scope.isLoading = false;
                    alert((err.data && err.data.message) || 'Error creating franchise.');
                });
        }
    };

    $scope.deleteFranchise = function (f) {
        if (confirm('Are you sure you want to deactivate/delete ' + f.name + '?')) {
            $scope.isLoading = true;
            FranchiseService.remove(f.id)
                .then(function (res) {
                    $scope.isLoading = false;
                    alert(res.data.message || 'Franchise status updated.');
                    $scope.loadFranchises();
                })
                .catch(function (err) {
                    $scope.isLoading = false;
                    alert('Error deleting franchise: ' + ((err.data && err.data.message) || ''));
                });
        }
    };

    $scope.viewFranchise = function (f) {
        $scope.isLoading = true;
        FranchiseService.getById(f.id)
            .then(function (res) {
                $scope.isLoading = false;
                if (res.data && res.data.success) {
                    $scope.selectedFranchise = res.data.data;
                    $scope.showViewModal = true;
                }
            })
            .catch(function () {
                $scope.isLoading = false;
                $scope.selectedFranchise = angular.copy(f);
                $scope.showViewModal = true;
            });
    };

    $scope.closeViewModal = function () {
        $scope.showViewModal = false;
    };

    $scope.closeModal = function () {
        $scope.showModal = false;
    };

    $scope.logout = function () {
        if (confirm('Logout?')) AuthService.logout();
    };
}]);

// Inventory Controller
app.controller('InventoryController', ['$scope', 'InventoryService', 'ProductService', 'FranchiseService', 'AuthService', function ($scope, InventoryService, ProductService, FranchiseService, AuthService) {
    $scope.currentUser = AuthService.getCurrentUser();
    if (!$scope.currentUser) {
        AuthService.restore().then(function (u) { $scope.currentUser = u; });
    }
    $scope.viewMode = 'cards';
    $scope.locationTab = 'ALL';
    $scope.totalStockCount = 0;
    $scope.mainStockCount = 0;
    $scope.lowStockCount = 0;
    $scope.inventory = [];
    $scope.products = [];
    $scope.franchises = [];
    $scope.searchText = '';
    $scope.categoryFilter = '';
    $scope.franchiseFilter = '';
    $scope.isLoading = false;

    $scope.setLocationTab = function (tab) {
        $scope.locationTab = tab;
    };

    $scope.filterByLocation = function (item) {
        if (!item) return false;
        if ($scope.locationTab === 'ALL') return true;
        if ($scope.locationTab === 'MAIN') return Boolean(item.is_main_franchise);
        if ($scope.locationTab === 'BRANCHES') return !item.is_main_franchise;
        if ($scope.locationTab === 'LOW') return (Number(item.quantity) || 0) <= (Number(item.reorder_level) || 10);
        return true;
    };

    // Modals
    $scope.showProductModal = false;
    $scope.showStockModal = false;
    $scope.isStockIn = true;
    $scope.productForm = {};
    $scope.stockForm = { franchise_id: '', product_id: '', quantity: 10 };

    $scope.categories = ['Hardware', 'Software Licenses', 'Cabling', 'Services'];

    $scope.loadAllData = function () {
        $scope.isLoading = true;
        InventoryService.getAll()
            .then(function (res) {
                $scope.isLoading = false;
                if (res.data && res.data.success) {
                    $scope.inventory = res.data.data;
                    var total = 0, main = 0, low = 0;
                    angular.forEach($scope.inventory, function (item) {
                        var q = Number(item.quantity) || 0;
                        var r = Number(item.reorder_level) || 10;
                        total += q;
                        if (item.is_main_franchise) main += q;
                        if (q <= r) low++;
                    });
                    $scope.totalStockCount = total;
                    $scope.mainStockCount = main;
                    $scope.lowStockCount = low;
                }
            })
            .catch(function (err) {
                $scope.isLoading = false;
                console.error('Inventory load error:', err);
            });

        ProductService.getAll().then(function (res) {
            if (res.data && res.data.success) $scope.products = res.data.data;
        });

        FranchiseService.getAll().then(function (res) {
            if (res.data && res.data.success) $scope.franchises = res.data.data;
        });
    };

    $scope.loadAllData();

    $scope.openAddProduct = function () {
        $scope.productForm = {
            product_code: '',
            name: '',
            category: 'Hardware',
            price: 0,
            cost_price: 0,
            reorder_level: 10,
            description: '',
            status: 'ACTIVE'
        };
        $scope.showProductModal = true;
    };

    $scope.saveProduct = function () {
        if (!$scope.productForm.name || !$scope.productForm.category) {
            alert('Product Name and Category are required.');
            return;
        }

        $scope.isLoading = true;
        ProductService.create($scope.productForm)
            .then(function (res) {
                $scope.isLoading = false;
                $scope.showProductModal = false;
                alert('Product created and added to branch catalogs.');
                $scope.loadAllData();
            })
            .catch(function (err) {
                $scope.isLoading = false;
                alert((err.data && err.data.message) || 'Error saving product.');
            });
    };

    $scope.openStockModal = function (item, isStockIn) {
        $scope.isStockIn = isStockIn;
        $scope.stockForm = {
            franchise_id: item ? item.franchise_id : ($scope.franchises[0] ? $scope.franchises[0].id : ''),
            product_id: item ? item.product_id : ($scope.products[0] ? $scope.products[0].id : ''),
            quantity: 10,
            product_name: item ? item.product_name : '',
            franchise_name: item ? item.franchise_name : '',
            current_quantity: item ? item.quantity : 0
        };
        $scope.showStockModal = true;
    };

    $scope.submitStockAction = function () {
        var qty = parseInt($scope.stockForm.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
            alert('Please enter a valid positive quantity.');
            return;
        }

        $scope.isLoading = true;
        var promise = $scope.isStockIn
            ? InventoryService.stockIn($scope.stockForm)
            : InventoryService.stockOut($scope.stockForm);

        promise
            .then(function (res) {
                $scope.isLoading = false;
                $scope.showStockModal = false;
                alert(res.data.message || 'Stock updated successfully.');
                $scope.loadAllData();
            })
            .catch(function (err) {
                $scope.isLoading = false;
                alert((err.data && err.data.message) || 'Stock operation rejected by server.');
            });
    };

    $scope.logout = function () {
        if (confirm('Logout?')) AuthService.logout();
    };
}]);

// Orders Controller
app.controller('OrdersController', ['$scope', 'OrderService', 'AuthService', function ($scope, OrderService, AuthService) {
    $scope.currentUser = AuthService.getCurrentUser();
    if (!$scope.currentUser) {
        AuthService.restore().then(function (u) { $scope.currentUser = u; });
    }
    $scope.viewMode = 'cards';
    $scope.typeFilter = 'ALL';
    $scope.mainTransferCount = 0;
    $scope.franchiseTransferCount = 0;
    $scope.totalOrderValuation = 0;
    $scope.orders = [];
    $scope.searchText = '';
    $scope.statusFilter = 'All';
    $scope.statusOptions = ['All', 'PENDING', 'PROCESSING', 'IN TRANSIT', 'COMPLETED', 'DELIVERED', 'CANCELLED'];
    $scope.isLoading = false;
    $scope.selectedOrder = null;
    $scope.showDetailModal = false;

    $scope.setTypeFilter = function (type) {
        $scope.typeFilter = type;
    };

    $scope.filterByType = function (ord) {
        if (!ord) return false;
        if ($scope.typeFilter === 'ALL') return true;
        if ($scope.typeFilter === 'MAIN') return !ord.is_franchise_to_franchise;
        if ($scope.typeFilter === 'BRANCH') return Boolean(ord.is_franchise_to_franchise);
        return true;
    };

    $scope.loadOrders = function () {
        $scope.isLoading = true;
        OrderService.getAll()
            .then(function (res) {
                $scope.isLoading = false;
                if (res.data && res.data.success) {
                    $scope.orders = res.data.data;
                    var mainC = 0, branchC = 0, totalV = 0;
                    angular.forEach($scope.orders, function (o) {
                        if (o.is_franchise_to_franchise) branchC++;
                        else mainC++;
                        totalV += Number(o.total) || 0;
                    });
                    $scope.mainTransferCount = mainC;
                    $scope.franchiseTransferCount = branchC;
                    $scope.totalOrderValuation = totalV;
                }
            })
            .catch(function (err) {
                $scope.isLoading = false;
                console.error('Order load error:', err);
            });
    };

    $scope.loadOrders();

    $scope.updateOrderStatus = function (order, newStatus) {
        if (!confirm('Update order ' + order.order_number + ' status to ' + newStatus + '?')) return;
        $scope.isLoading = true;
        OrderService.updateStatus(order.id, newStatus)
            .then(function (res) {
                $scope.isLoading = false;
                order.status = newStatus;
                alert(res.data.message || 'Order status updated.');
            })
            .catch(function (err) {
                $scope.isLoading = false;
                alert((err.data && err.data.message) || 'Failed to update order status.');
                $scope.loadOrders();
            });
    };

    $scope.viewOrderDetails = function (order) {
        $scope.isLoading = true;
        OrderService.getById(order.id)
            .then(function (res) {
                $scope.isLoading = false;
                if (res.data && res.data.success) {
                    $scope.selectedOrder = res.data.data;
                    $scope.showDetailModal = true;
                }
            })
            .catch(function () {
                $scope.isLoading = false;
                $scope.selectedOrder = order;
                $scope.showDetailModal = true;
            });
    };

    $scope.closeDetailModal = function () {
        $scope.showDetailModal = false;
        $scope.selectedOrder = null;
    };

    $scope.deleteOrder = function (order) {
        if (confirm('Delete order ' + order.order_number + '?')) {
            $scope.isLoading = true;
            OrderService.remove(order.id)
                .then(function () {
                    $scope.isLoading = false;
                    $scope.loadOrders();
                })
                .catch(function (err) {
                    $scope.isLoading = false;
                    alert('Error removing order: ' + ((err.data && err.data.message) || ''));
                });
        }
    };

    $scope.logout = function () {
        if (confirm('Logout?')) AuthService.logout();
    };
}]);

// Order Form Controller: Multi-source Transfer & Replenishment Order Creation
app.controller('OrderFormController', ['$scope', '$window', 'OrderService', 'FranchiseService', 'ProductService', 'InventoryService', 'AuthService', function ($scope, $window, OrderService, FranchiseService, ProductService, InventoryService, AuthService) {
    $scope.currentUser = AuthService.getCurrentUser();
    if (!$scope.currentUser) {
        AuthService.restore().then(function (u) { $scope.currentUser = u; });
    }

    $scope.franchises = [];
    $scope.destinationOptions = [];
    $scope.allProducts = [];
    $scope.allInventory = [];
    $scope.availableSources = [];
    $scope.selectedSourceIsMain = false;
    $scope.currentSourceStock = 0;
    $scope.mainInventoryOutOfStock = false;
    $scope.hasAlternateBranchStock = false;
    $scope.alternateBranchSuggestion = '';
    $scope.totalNetworkStock = 0;
    $scope.isLoading = false;
    $scope.isSubmitting = false;

    // Order transfer model
    $scope.order = {
        franchise_id: '', // Destination franchise branch
        source_id: '',    // Source inventory location
        customer_name: 'Branch Replenishment Dispatch',
        customer_phone: '',
        items: []
    };

    // Item draft
    $scope.draftItem = {
        product: null,
        quantity: 1
    };

    $scope.subtotal = 0;
    $scope.tax = 0;
    $scope.total = 0;

    $scope.loadInitialData = function () {
        $scope.isLoading = true;
        FranchiseService.getAll().then(function (res) {
            if (res.data && res.data.success) {
                $scope.franchises = res.data.data.filter(function (f) { return f.status === 'ACTIVE'; });
                $scope.destinationOptions = $scope.franchises;
                // Set default destination to first branch that is not headOffice (or first franchise)
                if ($scope.franchises.length > 0) {
                    var defaultDest = $scope.franchises.find(function (f) { return !f.isHeadOffice; }) || $scope.franchises[0];
                    $scope.order.franchise_id = String(defaultDest.id);
                }
            }
        });

        ProductService.getAll().then(function (res) {
            if (res.data && res.data.success) {
                $scope.allProducts = res.data.data.filter(function (p) { return p.status === 'ACTIVE'; });
            }
        });

        InventoryService.getAll().then(function (res) {
            $scope.isLoading = false;
            if (res.data && res.data.success) {
                $scope.allInventory = res.data.data || [];
            }
        }).catch(function () {
            $scope.isLoading = false;
        });
    };

    $scope.loadInitialData();

    $scope.getSourceName = function (id) {
        if (!id) return 'Not selected';
        var f = $scope.franchises.find(function (x) { return String(x.id) === String(id); });
        if (!f) return 'Inventory Location';
        return f.name + (f.isHeadOffice ? ' (Main Inventory)' : '');
    };

    $scope.getDestName = function (id) {
        if (!id) return 'Not selected';
        var f = $scope.franchises.find(function (x) { return String(x.id) === String(id); });
        return f ? f.name : 'Franchise Branch';
    };

    $scope.onDestinationChange = function () {
        // Prevent source and destination from being the same
        if ($scope.order.source_id && String($scope.order.source_id) === String($scope.order.franchise_id)) {
            $scope.order.source_id = '';
        }
        if ($scope.draftItem.product) {
            $scope.updateAvailableSources();
        }
    };

    $scope.onProductSelect = function () {
        $scope.updateAvailableSources();
    };

    $scope.updateAvailableSources = function () {
        if (!$scope.draftItem.product) {
            $scope.availableSources = [];
            $scope.mainInventoryOutOfStock = false;
            $scope.hasAlternateBranchStock = false;
            $scope.alternateBranchSuggestion = '';
            $scope.totalNetworkStock = 0;
            return;
        }

        var prodId = String($scope.draftItem.product.id);
        var sources = [];
        var mainStock = 0;
        var alternateBranch = null;
        var totalNet = 0;

        angular.forEach($scope.franchises, function (f) {
            var inv = $scope.allInventory.find(function (item) {
                return String(item.franchise_id) === String(f.id) && String(item.product_id) === prodId;
            });
            var stock = inv ? (Number(inv.quantity) || 0) : 0;
            totalNet += stock;
            var isMain = Boolean(f.isHeadOffice);
            if (isMain) {
                mainStock = stock;
            } else if (stock > 0 && String(f.id) !== String($scope.order.franchise_id) && !alternateBranch) {
                alternateBranch = f.name;
            }

            var isDest = String(f.id) === String($scope.order.franchise_id);
            var label = f.name + (isMain ? ' [Main Central Inventory]' : '') + ' — Available: ' + stock + ' units';
            if (isDest) label += ' (Destination - cannot self-transfer)';
            else if (stock <= 0) label += ' (Out of stock)';

            sources.push({
                franchise_id: String(f.id),
                name: f.name,
                isMain: isMain,
                stock: stock,
                sourceLabel: label,
                isDisabled: isDest || stock <= 0
            });
        });

        $scope.availableSources = sources;
        $scope.totalNetworkStock = totalNet;
        $scope.mainInventoryOutOfStock = (mainStock <= 0);
        $scope.hasAlternateBranchStock = Boolean(alternateBranch);
        $scope.alternateBranchSuggestion = alternateBranch || '';

        // Auto-select valid source: prioritize Main Inventory, else fallback to valid branch
        var mainSource = sources.find(function (s) { return s.isMain && !s.isDisabled; });
        var firstValid = sources.find(function (s) { return !s.isDisabled; });

        if (mainSource) {
            $scope.order.source_id = mainSource.franchise_id;
        } else if (firstValid) {
            $scope.order.source_id = firstValid.franchise_id;
        } else {
            $scope.order.source_id = '';
        }

        $scope.onSourceChange();
    };

    $scope.onSourceChange = function () {
        var sel = $scope.availableSources.find(function (s) { return String(s.franchise_id) === String($scope.order.source_id); });
        $scope.selectedSourceIsMain = sel ? sel.isMain : false;
        $scope.currentSourceStock = sel ? sel.stock : 0;
        if ($scope.draftItem.quantity > $scope.currentSourceStock) {
            $scope.draftItem.quantity = Math.max(1, $scope.currentSourceStock);
        }
    };

    $scope.addItem = function () {
        if (!$scope.draftItem.product) {
            alert('Please select a product item.');
            return;
        }
        if (!$scope.order.franchise_id) {
            alert('Please select a destination franchise branch.');
            return;
        }
        if (!$scope.order.source_id) {
            alert('Please select a valid source inventory location.');
            return;
        }
        if (String($scope.order.source_id) === String($scope.order.franchise_id)) {
            alert('Transfer error: Source and destination locations cannot be the same franchise.');
            return;
        }

        var qty = parseInt($scope.draftItem.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
            alert('Please enter a valid quantity greater than 0.');
            return;
        }
        if (qty > $scope.currentSourceStock) {
            alert('Requested quantity (' + qty + ') exceeds available source inventory (' + $scope.currentSourceStock + ').');
            return;
        }

        var prod = $scope.draftItem.product;
        var existing = $scope.order.items.find(function (i) {
            return String(i.product_id) === String(prod.id) && String(i.source_id) === String($scope.order.source_id);
        });

        if (existing) {
            if (existing.quantity + qty > $scope.currentSourceStock) {
                alert('Total quantity (' + (existing.quantity + qty) + ') exceeds available stock (' + $scope.currentSourceStock + ').');
                return;
            }
            existing.quantity += qty;
            existing.line_total = existing.quantity * existing.unit_price;
        } else {
            var unitPrice = Number(prod.price) || 0;
            $scope.order.items.push({
                product_id: String(prod.id),
                product_name: prod.name,
                product_code: prod.product_code || prod.productCode,
                source_id: String($scope.order.source_id),
                source_name: $scope.getSourceName($scope.order.source_id),
                quantity: qty,
                unit_price: unitPrice,
                line_total: unitPrice * qty,
                maxAvailable: $scope.currentSourceStock
            });
        }

        $scope.draftItem = { product: null, quantity: 1 };
        $scope.calculateTotals();
    };

    $scope.removeItem = function (index) {
        $scope.order.items.splice(index, 1);
        $scope.calculateTotals();
    };

    $scope.calculateTotals = function () {
        var baseSubtotal = 0;
        angular.forEach($scope.order.items, function (item) {
            item.line_total = item.quantity * item.unit_price;
            baseSubtotal += item.line_total;
        });
        $scope.subtotal = parseFloat(baseSubtotal.toFixed(2));
        $scope.tax = parseFloat(($scope.subtotal * 0.18).toFixed(2));
        $scope.total = parseFloat(($scope.subtotal + $scope.tax).toFixed(2));
    };

    $scope.submitOrder = function () {
        if (!$scope.order.franchise_id) {
            alert('Please select a destination franchise branch.');
            return;
        }
        if (!$scope.order.source_id) {
            alert('Please select a source location.');
            return;
        }
        if (String($scope.order.source_id) === String($scope.order.franchise_id)) {
            alert('Source and destination cannot be identical.');
            return;
        }
        if (!$scope.order.items || $scope.order.items.length === 0) {
            alert('Please add at least one item to transfer.');
            return;
        }
        if ($scope.order.customer_phone && !AuthService.validateIndianPhone($scope.order.customer_phone)) {
            alert('Please enter a valid 10-digit Indian mobile number for contact phone.');
            return;
        }

        $scope.isSubmitting = true;
        var payload = {
            destination_id: $scope.order.franchise_id,
            source_id: $scope.order.source_id,
            customer_name: $scope.order.customer_name || 'Enterprise Stock Transfer',
            customer_phone: $scope.order.customer_phone || '',
            items: $scope.order.items.map(function (i) {
                return { product_id: i.product_id, quantity: i.quantity };
            })
        };

        OrderService.create(payload)
            .then(function (res) {
                $scope.isSubmitting = false;
                if (res.data && res.data.success) {
                    alert('Inventory Transfer Authorized!\nOrder Reference: ' + (res.data.data ? res.data.data.order_number : 'Created'));
                    $window.location.href = 'orders.html';
                }
            })
            .catch(function (err) {
                $scope.isSubmitting = false;
                alert('Transfer Failed: ' + ((err.data && err.data.message) || 'Server rejected transfer.'));
            });
    };

    $scope.logout = function () {
        if (confirm('Logout?')) AuthService.logout();
    };
}]);

app.controller('CompanySetupController', ['$scope', '$window', 'CompanyService', 'AuthService', function ($scope, $window, CompanyService, AuthService) {
    $scope.step = 1; $scope.data = {}; $scope.message = ''; $scope.error = ''; $scope.loading = true;
    CompanyService.setup().then(function (res) { var d = res.data.data; $scope.data.company = d.company || {}; $scope.data.brand = d.brand || {}; $scope.data.mainFranchise = d.mainFranchise || {}; $scope.data.warehouse = d.warehouse || {}; $scope.data.admin = d.admin || {}; $scope.step = Math.min(5, (d.setupStep || 0) + 1); }).finally(function () { $scope.loading = false; });
    $scope.save = function () {
        $scope.error = ''; $scope.message = '';
        // Phone validation for steps that have phone fields
        var phoneToCheck = null;
        if ($scope.step === 1) phoneToCheck = $scope.data.company && $scope.data.company.phone;
        if ($scope.step === 3) phoneToCheck = $scope.data.mainFranchise && $scope.data.mainFranchise.phone;
        if ($scope.step === 4) phoneToCheck = $scope.data.warehouse && $scope.data.warehouse.phone;
        if ($scope.step === 5) phoneToCheck = $scope.data.admin && $scope.data.admin.phone;
        if (phoneToCheck && !AuthService.validateIndianPhone(phoneToCheck)) {
            $scope.error = 'Enter a valid 10-digit Indian mobile number.';
            return;
        }
        var payload = angular.extend({ step: $scope.step }, $scope.step === 1 ? $scope.data.company : $scope.step === 2 ? { brandName: $scope.data.brand.name, brandDetails: $scope.data.brand.details, brandLogoUrl: $scope.data.brand.logoUrl } : $scope.step === 3 ? $scope.data.mainFranchise : $scope.step === 4 ? $scope.data.warehouse : $scope.data.admin);
        CompanyService.saveSetup(payload).then(function (res) { $scope.message = res.data.message; if ($scope.step === 5) $window.location.href = 'dashboard.html'; else $scope.step++; }).catch(function (err) { $scope.error = err.data && err.data.message || 'Unable to save this setup step.'; });
    };
    $scope.logout = function () { AuthService.logout(); };
}]);

app.controller('SettingsController', ['$scope', 'ProfileService', 'AuthService', function ($scope, ProfileService, AuthService) {
    $scope.currentUser = AuthService.getCurrentUser();
    if (!$scope.currentUser) {
        AuthService.restore().then(function (u) { $scope.currentUser = u; });
    }
    $scope.profile = {};
    $scope.password = {};
    $scope.message = '';
    $scope.error = '';

    ProfileService.get().then(function (res) {
        $scope.profile = res.data.data || {};
    });

    $scope.saveProfile = function () {
        $scope.message = '';
        $scope.error = '';
        if ($scope.profile.phone && !AuthService.validateIndianPhone($scope.profile.phone)) {
            $scope.error = 'Enter a valid 10-digit Indian mobile number.';
            return;
        }
        ProfileService.update($scope.profile).then(function (res) {
            $scope.message = res.data.message || 'Profile and branding updated successfully.';
            if ($scope.currentUser) {
                $scope.currentUser.logoUrl = $scope.profile.avatarUrl;
                $scope.currentUser.name = $scope.profile.name;
                $scope.currentUser.email = $scope.profile.email;
            }
        }).catch(function (err) {
            $scope.error = (err.data && err.data.message) || 'Unable to update profile.';
        });
    };

    $scope.changePassword = function () {
        $scope.message = '';
        $scope.error = '';
        if ($scope.password.newPassword !== $scope.password.confirmPassword) {
            $scope.error = 'New password confirmation does not match.';
            return;
        }
        ProfileService.changePassword($scope.password).then(function (res) {
            $scope.message = res.data.message || 'Password changed successfully.';
            $scope.password = {};
        }).catch(function (err) {
            $scope.error = (err.data && err.data.message) || 'Unable to change password.';
        });
    };

    $scope.logout = function () {
        AuthService.logout();
    };
}]);
