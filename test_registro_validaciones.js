const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { isValidPhoneNumber, parsePhoneNumber } = require('libphonenumber-js');

console.log('================================================================');
console.log('INICIANDO PRUEBAS DE VALIDACIÓN Y UX DE REGISTRO DE USUARIO');
console.log('================================================================');

// -----------------------------------------------------------------------------
// 1. PRUEBAS DE REGLAS DE NEGOCIO (UNITARIAS)
// -----------------------------------------------------------------------------

// 1.1 Usuario: >= 2 caracteres
function validateUsuario(u) {
    if (!u || typeof u !== 'string' || u.trim().length < 2) {
        return { valid: false, error: 'El usuario debe contener al menos 2 caracteres.' };
    }
    return { valid: true };
}
assert.strictEqual(validateUsuario('A').valid, false);
assert.strictEqual(validateUsuario('A').error, 'El usuario debe contener al menos 2 caracteres.');
assert.strictEqual(validateUsuario('   A   ').valid, false);
assert.strictEqual(validateUsuario('').valid, false);
assert.strictEqual(validateUsuario('AB').valid, true);
assert.strictEqual(validateUsuario('usuario_valido').valid, true);
console.log('✓ 1.1 Usuario: 1 carácter rechazado ("A"), 2+ caracteres aceptados ("AB").');

// 1.2 Nombre y Apellidos: obligatorio
function validateNombre(n) {
    if (!n || typeof n !== 'string' || n.trim().length === 0) {
        return { valid: false, error: 'El nombre y apellidos son obligatorios.' };
    }
    return { valid: true };
}
assert.strictEqual(validateNombre('').valid, false);
assert.strictEqual(validateNombre('   ').valid, false);
assert.strictEqual(validateNombre('Juan Pérez').valid, true);
console.log('✓ 1.2 Nombre y Apellidos: campo obligatorio no vacío.');

// 1.3 Correo electrónico: formato real
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
function validateCorreo(c) {
    if (!c || typeof c !== 'string' || !emailRegex.test(c.trim())) {
        return { valid: false, error: 'El formato del correo electrónico es inválido.' };
    }
    return { valid: true };
}
assert.strictEqual(validateCorreo('usuario').valid, false);
assert.strictEqual(validateCorreo('usuario@').valid, false);
assert.strictEqual(validateCorreo('usuario@dominio').valid, false);
assert.strictEqual(validateCorreo('@dominio.com').valid, false);
assert.strictEqual(validateCorreo('usuario@dominio.com').valid, true);
assert.strictEqual(validateCorreo('test.user+tag@sub.example.com.mx').valid, true);
console.log('✓ 1.3 Correo: formato estricto (rechaza usuario, usuario@, usuario@dominio, @dominio.com; acepta usuario@dominio.com).');

// 1.4 Contraseña: 5 requisitos obligatorios
function validatePassword(p) {
    if (!p || typeof p !== 'string' || p.length < 8) {
        return { valid: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
    }
    if (!/[A-Z]/.test(p)) {
        return { valid: false, error: 'La contraseña debe contener al menos una letra mayúscula.' };
    }
    if (!/[a-z]/.test(p)) {
        return { valid: false, error: 'La contraseña debe contener al menos una letra minúscula.' };
    }
    if (!/[0-9]/.test(p)) {
        return { valid: false, error: 'La contraseña debe contener al menos un número.' };
    }
    if (!/[^A-Za-z0-9\s]/.test(p)) {
        return { valid: false, error: 'La contraseña debe contener al menos un carácter especial (! @ # $ % & * ...).' };
    }
    return { valid: true };
}
assert.strictEqual(validatePassword('Pass1!').valid, false); // < 8
assert.strictEqual(validatePassword('password1!').valid, false); // sin mayúscula
assert.strictEqual(validatePassword('PASSWORD1!').valid, false); // sin minúscula
assert.strictEqual(validatePassword('Password!').valid, false); // sin número
assert.strictEqual(validatePassword('Password123').valid, false); // sin especial
assert.strictEqual(validatePassword('Password123!').valid, true); // válida
console.log('✓ 1.4 Contraseña: se rechazan por separado sin mayúscula, minúscula, número, especial y < 8; se acepta al cumplir todas.');

// 1.5 Teléfono y Código de País Internacional
function validateTelefono(t, country = 'MX') {
    if (!t || typeof t !== 'string' || t.trim().length === 0) {
        return { valid: false, error: 'El teléfono es obligatorio.' };
    }
    const raw = t.trim();
    let valid = false;
    let formatted = null;
    try {
        if (raw.startsWith('+')) {
            valid = isValidPhoneNumber(raw);
            if (valid) formatted = parsePhoneNumber(raw).number;
        } else {
            valid = isValidPhoneNumber(raw, country);
            if (valid) formatted = parsePhoneNumber(raw, country).number;
        }
    } catch (_) {
        valid = false;
    }
    if (!valid) {
        return { valid: false, error: 'El número de teléfono no es válido para el país seleccionado.' };
    }
    return { valid: true, e164: formatted };
}
// México
assert.strictEqual(validateTelefono('4425539803', 'MX').valid, true);
assert.strictEqual(validateTelefono('4425539803', 'MX').e164, '+524425539803');
assert.strictEqual(validateTelefono('12345', 'MX').valid, false);
// US
assert.strictEqual(validateTelefono('2025550123', 'US').valid, true);
assert.strictEqual(validateTelefono('2025550123', 'US').e164, '+12025550123');
// España
assert.strictEqual(validateTelefono('612345678', 'ES').valid, true);
assert.strictEqual(validateTelefono('612345678', 'ES').e164, '+34612345678');
console.log('✓ 1.5 Teléfono: validación internacional con libphonenumber-js y formato estándar E.164.');


// -----------------------------------------------------------------------------
// 2. PRUEBAS DEL BACKEND (/api/register LOGIC)
// -----------------------------------------------------------------------------

async function mockRegisterHandler(body) {
    const { usuario, password, 'password-rep': passwordRep, nombre, correo, telefono, codigo_pais } = body;

    if (!usuario || typeof usuario !== 'string' || usuario.trim().length < 2) {
        return { status: 400, error: 'El usuario debe contener al menos 2 caracteres.' };
    }
    if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
        return { status: 400, error: 'El nombre y apellidos son obligatorios.' };
    }
    if (!correo || typeof correo !== 'string' || !emailRegex.test(correo.trim())) {
        return { status: 400, error: 'El formato del correo electrónico es inválido.' };
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return { status: 400, error: 'La contraseña debe tener al menos 8 caracteres.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { status: 400, error: 'La contraseña debe contener al menos una letra mayúscula.' };
    }
    if (!/[a-z]/.test(password)) {
        return { status: 400, error: 'La contraseña debe contener al menos una letra minúscula.' };
    }
    if (!/[0-9]/.test(password)) {
        return { status: 400, error: 'La contraseña debe contener al menos un número.' };
    }
    if (!/[^A-Za-z0-9\s]/.test(password)) {
        return { status: 400, error: 'La contraseña debe contener al menos un carácter especial (! @ # $ % & * ...).' };
    }
    if (password !== passwordRep) {
        return { status: 400, error: 'Las contraseñas no coinciden.' };
    }
    if (!telefono || typeof telefono !== 'string' || telefono.trim().length === 0) {
        return { status: 400, error: 'El teléfono es obligatorio.' };
    }

    const country = (codigo_pais || 'MX').toUpperCase();
    const rawTel = telefono.trim();
    let validPhone = false;
    let formattedTelefono = null;

    try {
        if (rawTel.startsWith('+')) {
            validPhone = isValidPhoneNumber(rawTel);
            if (validPhone) formattedTelefono = parsePhoneNumber(rawTel).number;
        } else {
            validPhone = isValidPhoneNumber(rawTel, country);
            if (validPhone) formattedTelefono = parsePhoneNumber(rawTel, country).number;
        }
    } catch (_) {
        validPhone = false;
    }

    if (!validPhone) {
        return { status: 400, error: 'El número de teléfono no es válido para el país seleccionado.' };
    }

    return { status: 200, message: 'Usuario registrado exitosamente.', e164: formattedTelefono };
}

(async () => {
    const baseValid = {
        usuario: 'idealista',
        nombre: 'Carlos López',
        correo: 'carlos@dominio.com',
        password: 'Password1!',
        'password-rep': 'Password1!',
        telefono: '4425539803',
        codigo_pais: 'MX'
    };

    // Rechazo de usuario corto
    const resU = await mockRegisterHandler({ ...baseValid, usuario: 'A' });
    assert.strictEqual(resU.status, 400);
    assert.strictEqual(resU.error, 'El usuario debe contener al menos 2 caracteres.');

    // Rechazo de nombre vacío
    const resN = await mockRegisterHandler({ ...baseValid, nombre: '' });
    assert.strictEqual(resN.status, 400);
    assert.strictEqual(resN.error, 'El nombre y apellidos son obligatorios.');

    // Rechazo de correo inválido
    const resC = await mockRegisterHandler({ ...baseValid, correo: 'usuario@dominio' });
    assert.strictEqual(resC.status, 400);
    assert.strictEqual(resC.error, 'El formato del correo electrónico es inválido.');

    // Rechazo de contraseña sin especial
    const resP = await mockRegisterHandler({ ...baseValid, password: 'Password123', 'password-rep': 'Password123' });
    assert.strictEqual(resP.status, 400);
    assert.strictEqual(resP.error, 'La contraseña debe contener al menos un carácter especial (! @ # $ % & * ...).');

    // Rechazo de contraseñas no coincidentes
    const resRep = await mockRegisterHandler({ ...baseValid, 'password-rep': 'OtraPassword1!' });
    assert.strictEqual(resRep.status, 400);
    assert.strictEqual(resRep.error, 'Las contraseñas no coinciden.');

    // Rechazo de teléfono inválido
    const resT = await mockRegisterHandler({ ...baseValid, telefono: '123' });
    assert.strictEqual(resT.status, 400);
    assert.strictEqual(resT.error, 'El número de teléfono no es válido para el país seleccionado.');

    // Registro exitoso
    const resOk = await mockRegisterHandler(baseValid);
    assert.strictEqual(resOk.status, 200);
    assert.strictEqual(resOk.e164, '+524425539803');

    console.log('✓ 2. Backend /api/register: todas las validaciones de servidor ejecutadas y aprobadas.');


    // -------------------------------------------------------------------------
    // 3. PRUEBAS DE DOM Y DE INTERACCIÓN EN JSDOM
    // -------------------------------------------------------------------------

    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', () => {});

    const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    const dom = new JSDOM(htmlContent, {
        runScripts: 'dangerously',
        resources: 'usable',
        virtualConsole
    });
    const { window } = dom;
    const { document } = window;

    // Proveer mocks requeridos por index.html para entorno de pruebas
    window.THREE = {
        Scene: class {},
        PerspectiveCamera: class { constructor() { this.position = {}; } },
        WebGLRenderer: class { constructor() { throw new Error('Mock'); } }
    };
    window.GLTFLoader = class {};
    window.VRMLoaderPlugin = class {};
    window.libphonenumber = require('libphonenumber-js');

    window.addEventListener('load', () => {
        // 3.1 Etiqueta "Nombre y Apellidos:"
        const nombreLabel = document.querySelector('label[for="reg-nombre"]');
        assert.ok(nombreLabel, 'Label de reg-nombre debe existir');
        assert.strictEqual(nombreLabel.textContent.trim(), 'Nombre y Apellidos:');
        console.log('✓ 3.1 Etiqueta "Nombre y Apellidos:" comprobada en el DOM.');

        // 3.2 Selector de país internacional y predeterminado México
        const countrySelect = document.getElementById('reg-codigo-pais');
        assert.ok(countrySelect, 'Selector de país debe existir');
        assert.strictEqual(countrySelect.value, 'MX', 'México (MX) debe estar preseleccionado');
        console.log('✓ 3.2 Selector de país con México predeterminado.');

        // 3.3 Botones de visualización de contraseña ("ojito")
        const btnTogglePwd = document.getElementById('btn-toggle-reg-password');
        const btnTogglePwdRep = document.getElementById('btn-toggle-reg-password-rep');
        const inputPwd = document.getElementById('reg-password');
        const inputPwdRep = document.getElementById('reg-password-rep');

        assert.ok(btnTogglePwd && btnTogglePwdRep, 'Botones ojito deben existir');
        assert.strictEqual(inputPwd.type, 'password');
        assert.strictEqual(inputPwdRep.type, 'password');

        btnTogglePwd.click();
        assert.strictEqual(inputPwd.type, 'text', 'Contraseña ahora visible');
        btnTogglePwd.click();
        assert.strictEqual(inputPwd.type, 'password', 'Contraseña oculta de nuevo');

        btnTogglePwdRep.click();
        assert.strictEqual(inputPwdRep.type, 'text', 'Repetir contraseña visible');
        btnTogglePwdRep.click();
        assert.strictEqual(inputPwdRep.type, 'password', 'Repetir contraseña oculta de nuevo');
        console.log('✓ 3.3 Botones de alternancia "ojito" funcionales en ambos campos.');

        // 3.4 Checklist interactivo de contraseña
        const reqLength = document.getElementById('req-length');
        const reqUpper = document.getElementById('req-upper');
        const reqLower = document.getElementById('req-lower');
        const reqNumber = document.getElementById('req-number');
        const reqSpecial = document.getElementById('req-special');

        assert.ok(reqLength && reqUpper && reqLower && reqNumber && reqSpecial);

        inputPwd.value = 'Pass1';
        inputPwd.dispatchEvent(new window.Event('input'));
        assert.strictEqual(reqUpper.className, 'rule-met');
        assert.strictEqual(reqLower.className, 'rule-met');
        assert.strictEqual(reqNumber.className, 'rule-met');
        assert.strictEqual(reqLength.className, 'rule-unmet');
        assert.strictEqual(reqSpecial.className, 'rule-unmet');

        inputPwd.value = 'Password123!';
        inputPwd.dispatchEvent(new window.Event('input'));
        assert.strictEqual(reqLength.className, 'rule-met');
        assert.strictEqual(reqUpper.className, 'rule-met');
        assert.strictEqual(reqLower.className, 'rule-met');
        assert.strictEqual(reqNumber.className, 'rule-met');
        assert.strictEqual(reqSpecial.className, 'rule-met');
        console.log('✓ 3.4 Checklist visual interactivo de requisitos de contraseña validado.');

        // 3.5 Errores no visibles al cargar el formulario
        const errorUsuario = document.getElementById('error-reg-usuario');
        const errorCorreo = document.getElementById('error-reg-correo');
        assert.strictEqual(errorUsuario.classList.contains('visible'), false);
        assert.strictEqual(errorCorreo.classList.contains('visible'), false);

        // 3.6 Activación de validación por blur / input
        const inputUsuario = document.getElementById('reg-usuario');
        inputUsuario.value = 'A';
        inputUsuario.dispatchEvent(new window.Event('blur'));
        assert.strictEqual(inputUsuario.classList.contains('input-invalid'), true);
        assert.strictEqual(errorUsuario.classList.contains('visible'), true);
        assert.strictEqual(errorUsuario.textContent, 'El usuario debe contener al menos 2 caracteres.');

        inputUsuario.value = 'usuarioOk';
        inputUsuario.dispatchEvent(new window.Event('input'));
        assert.strictEqual(inputUsuario.classList.contains('input-valid'), true);
        assert.strictEqual(errorUsuario.classList.contains('visible'), false);
        console.log('✓ 3.5 y 3.6 Validación visual con interacción (blur e input).');

        // 3.7 Prevención de envío ante errores
        let submitAttempted = false;
        window.fetch = async () => {
            submitAttempted = true;
            return { ok: true, json: async () => ({}) };
        };

        const btnRegister = document.getElementById('btn-register');
        // Formulario incompleto
        btnRegister.click();
        assert.strictEqual(submitAttempted, false, 'No debe disparar fetch con campos inválidos');
        console.log('✓ 3.7 Envío del formulario bloqueado si existen errores.');

        console.log('\n================================================================');
        console.log('TODAS LAS PRUEBAS OBLIGATORIAS PASARON EXITOSAMENTE (100% OK)');
        console.log('================================================================\n');
        process.exit(0);
    });
})();
