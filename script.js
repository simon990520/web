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

// Elementos del DOM
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const spinButton = document.getElementById('spinButton');
const modal = document.getElementById('prizeModal');
const claimButton = document.getElementById('claimButton');
const copyButton = document.getElementById('copyButton');
const confettiCanvas = document.getElementById('confetti');

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

    // Mostrar modal después de la animación
    setTimeout(() => {
        showModal();
        launchConfetti();
        isSpinning = false;
        spinButton.disabled = false;
        spinButton.textContent = 'SPIN';
    }, 4000);
}

// Mostrar modal
function showModal() {
    modal.classList.add('show');
    playSuccessSound();
}

// Cerrar modal
function closeModal() {
    modal.classList.remove('show');
}

// Copiar código promocional
function copyPromoCode() {
    const promoCode = document.getElementById('promoCode').textContent;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(promoCode).then(() => {
            showCopyFeedback();
        });
    } else {
        // Fallback para navegadores antiguos
        const input = document.createElement('input');
        input.value = promoCode;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showCopyFeedback();
    }
}

// Feedback al copiar
function showCopyFeedback() {
    const originalText = copyButton.textContent;
    copyButton.textContent = '✓';
    copyButton.style.background = 'rgba(0, 255, 0, 0.3)';

    setTimeout(() => {
        copyButton.textContent = originalText;
        copyButton.style.background = '';
    }, 1500);
}

// Efecto de sonido simulado (visual)
function playSuccessSound() {
    // Aquí podrías agregar un sonido real si lo deseas
    console.log('🎉 ¡Felicidades!');
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

        if (this.y > confettiCanvas.height - 100) {
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
copyButton.addEventListener('click', copyPromoCode);
claimButton.addEventListener('click', () => {
    alert('🎉 ¡Redirigiendo a la página de reclamación!');
    // Aquí podrías redirigir a una URL real
    // window.location.href = 'https://temu.com/...';
});

// Cerrar modal al hacer clic en el overlay
document.querySelector('.modal-overlay').addEventListener('click', closeModal);

// Ajustar canvas en resize
window.addEventListener('resize', () => {
    if (confettiPieces.length > 0) {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }
});

// Inicializar
drawWheel();
