/* =============================================================
   QUINTESSENCE — script.js  v4
   New: Hero Carousel · Shopping Cart · Product Search ·
        Stock Management · Shareable Links · CSV Export
============================================================= */

const SUPABASE_URL = "https://yqvvqzstbukcqoqbtfrd.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxdnZxenN0YnVrY3FvcWJ0ZnJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5Mjc2MzgsImV4cCI6MjA4NzUwMzYzOH0.JjZfo4FHHV-YOQh0BTDlYLX0beXZUWzg77j402YB6SM";

/*
  ---------------------------------------------------------------
  SUPABASE SQL SETUP (run once in Supabase SQL editor):
  ---------------------------------------------------------------

  -- Add is_in_stock column to products (run if upgrading):
  ALTER TABLE products ADD COLUMN IF NOT EXISTS is_in_stock BOOLEAN DEFAULT true;

  CREATE TABLE IF NOT EXISTS products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price NUMERIC NOT NULL,
    description TEXT,
    image_url TEXT,
    video_url TEXT,
    is_best_seller BOOLEAN DEFAULT false,
    is_in_stock BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
  );

  CREATE TABLE IF NOT EXISTS videos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT,
    review TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  ALTER TABLE products    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE videos      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reviews     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Public read products"    ON products    FOR SELECT USING (true);
  CREATE POLICY "Public read videos"      ON videos      FOR SELECT USING (true);
  CREATE POLICY "Public insert subscribe" ON subscribers FOR INSERT WITH CHECK (true);
  CREATE POLICY "Admin write products"    ON products    FOR ALL USING (auth.role() = 'authenticated');
  CREATE POLICY "Admin write videos"      ON videos      FOR ALL USING (auth.role() = 'authenticated');
  CREATE POLICY "Admin read subscribers"  ON subscribers FOR SELECT USING (auth.role() = 'authenticated');
  CREATE POLICY "Public insert reviews"   ON reviews     FOR INSERT WITH CHECK (true);
  CREATE POLICY "Public read reviews"     ON reviews     FOR SELECT USING (true);
  CREATE POLICY "Admin delete reviews"    ON reviews     FOR DELETE USING (auth.role() = 'authenticated');
  CREATE POLICY "Public read settings"    ON settings    FOR SELECT USING (true);
  CREATE POLICY "Admin write settings"    ON settings    FOR ALL USING (auth.role() = 'authenticated');

  Storage buckets to create:
    "products" (Public ON) and "videos" (Public ON)

  Admin user:
    Authentication → Users → Add User
  ---------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", () => {
  // ── Supabase init ──────────────────────────────────────────
  let db = null;
  try {
    const { createClient } = supabase;
    db = createClient(SUPABASE_URL, SUPABASE_ANON);
  } catch (e) {
    console.warn("Supabase not initialised:", e.message);
  }

  // ── State ──────────────────────────────────────────────────
  let allProducts = []; // all products from DB
  let cart = []; // { product, qty }
  let currentProduct = null; // product open in modal
  let whatsappNumber = "2348132386987";

  // ═══════════════════════════════════════════════════════════
  //  TOAST
  // ═══════════════════════════════════════════════════════════
  function showToast(msg, type = "success") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // ═══════════════════════════════════════════════════════════
  //  NAVBAR
  // ═══════════════════════════════════════════════════════════
  window.addEventListener(
    "scroll",
    () => {
      document
        .getElementById("navbar")
        .classList.toggle("scrolled", window.scrollY > 60);
    },
    { passive: true },
  );

  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobileMenu");
  hamburger.addEventListener("click", () =>
    mobileMenu.classList.toggle("open"),
  );
  mobileMenu
    .querySelectorAll("a")
    .forEach((l) =>
      l.addEventListener("click", () => mobileMenu.classList.remove("open")),
    );

  // ═══════════════════════════════════════════════════════════
  //  HERO CAROUSEL
  // ═══════════════════════════════════════════════════════════
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".carousel-dot");
  let currentSlide = 0;
  let carouselTimer = null;

  // Lazy-load hero slide background images
  // Each .hero-slide should use:
  //   data-bg="asset-base-name" (no extension) and optional data-gradient="linear-gradient(...)"
  const HERO_CAROUSEL_INTERVAL_MS = 9500;

  function pickExistingAsset(baseName) {
    return new Promise((resolve) => {
      if (!baseName) return resolve(null);

      const exts = ["jpg", "png", "webp"];
      let i = 0;

      const tryNext = () => {
        if (i >= exts.length) return resolve(null);

        const relPath = `assets/${baseName}.${exts[i++]}`;
        const img = new Image();

        img.onload = () => resolve(relPath);
        img.onerror = () => tryNext();

        // Trigger load (works on file:// and http(s)://)
        img.src = relPath;
      };

      tryNext();
    });
  }

  
// Compute a simple average color from the slide background image so the card/overlay can blend.
const _slideThemeCache = new Map();

async function computeSlideTheme(assetPath) {
  if (!assetPath) return null;
  if (_slideThemeCache.has(assetPath)) return _slideThemeCache.get(assetPath);

  const themePromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d", { willReadFrequently: true });
        const W = 32, H = 32;
        c.width = W; c.height = H;
        ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;

        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 40) continue; // ignore near-transparent pixels
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
        if (!n) return resolve(null);

        r = Math.round(r / n);
        g = Math.round(g / n);
        b = Math.round(b / n);

        // Perceived luminance to decide text contrast
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const isDark = luminance < 0.55;

        resolve({ r, g, b, isDark });
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = assetPath;
  });

  _slideThemeCache.set(assetPath, themePromise);
  return themePromise;
}

function applySlideTheme(slide, theme) {
  if (!slide || !theme) return;

  const overlay = slide.querySelector(".hero-overlay");
  const card = slide.querySelector(".overlay");
  if (!overlay || !card) return;

  // Blend the backdrop and the message card using the image's average color.
  overlay.style.background = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.45)`;

  // Use a tinted glass card for uniform look across slides.
  card.style.background = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.72)`;
  card.style.backdropFilter = "blur(10px)";
  card.style.webkitBackdropFilter = "blur(10px)";

  // Ensure readable text
  if (theme.isDark) {
    card.classList.add("overlay-dark");
  } else {
    card.classList.remove("overlay-dark");
  }
}

async function ensureSlideBackground(slide) {
    if (!slide || slide.dataset.bgLoaded === "1") return;

    const base = slide.dataset.bg;
    if (!base) return;

    const gradient = slide.dataset.gradient;
    const asset = await pickExistingAsset(base);
    if (!asset) return;

    slide.style.backgroundImage = gradient
      ? `${gradient}, url('${asset}')`
      : `url('${asset}')`;

    // Make the card/overlay blend with the slide image for a uniform look
    const theme = await computeSlideTheme(asset);
    applySlideTheme(slide, theme);

    slide.dataset.bgLoaded = "1";
  }

  function preloadCarouselImages(index) {
    if (!slides.length) return;
    void ensureSlideBackground(slides[index]);
    void ensureSlideBackground(slides[(index + 1) % slides.length]);
  }

  // Load the first slide immediately, then prime the next one
  preloadCarouselImages(0);

  function goToSlide(n) {
    slides[currentSlide].classList.remove("active");
    dots[currentSlide] && dots[currentSlide].classList.remove("active");
    currentSlide = (n + slides.length) % slides.length;
    slides[currentSlide].classList.add("active");
    dots[currentSlide] && dots[currentSlide].classList.add("active");
    preloadCarouselImages(currentSlide);
  }

  function startCarousel() {
    carouselTimer = setInterval(
      () => goToSlide(currentSlide + 1),
      HERO_CAROUSEL_INTERVAL_MS,
    );
  }
  function resetCarousel() {
    clearInterval(carouselTimer);
    startCarousel();
  }

  document.getElementById("carouselPrev").addEventListener("click", () => {
    goToSlide(currentSlide - 1);
    resetCarousel();
  });
  document.getElementById("carouselNext").addEventListener("click", () => {
    goToSlide(currentSlide + 1);
    resetCarousel();
  });
  dots.forEach((dot) =>
    dot.addEventListener("click", () => {
      goToSlide(+dot.dataset.index);
      resetCarousel();
    }),
  );

  // Swipe support for hero carousel
  let touchStartX = 0;
  document.getElementById("heroCarousel").addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true },
  );
  document.getElementById("heroCarousel").addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        goToSlide(currentSlide + (dx < 0 ? 1 : -1));
        resetCarousel();
      }
    },
    { passive: true },
  );

  if (slides.length > 1) startCarousel();

  // ═══════════════════════════════════════════════════════════
  //  BEST SELLERS CAROUSEL ARROWS
  // ═══════════════════════════════════════════════════════════
  const bsCarousel = document.getElementById("bestSellersCarousel");
  document.getElementById("bsPrev").addEventListener("click", () => {
    bsCarousel.scrollBy({ left: -240, behavior: "smooth" });
  });
  document.getElementById("bsNext").addEventListener("click", () => {
    bsCarousel.scrollBy({ left: 240, behavior: "smooth" });
  });

  // ═══════════════════════════════════════════════════════════
  //  SCROLL REVEAL
  // ═══════════════════════════════════════════════════════════
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add("visible");
      });
    },
    { threshold: 0.08 },
  );
  document
    .querySelectorAll("section:not(.faq-section), .testimonial-card, .why-item")
    .forEach((el) => {
      el.classList.add("reveal");
      revealObs.observe(el);
    });

  // ── Cart persistence ───────────────────────────────────────
  function saveCart() {
    try {
      localStorage.setItem("quint_cart", JSON.stringify(cart));
    } catch (e) {}
  }
  function loadCart() {
    try {
      const saved = localStorage.getItem("quint_cart");
      if (saved) {
        cart = JSON.parse(saved);
        updateCartBadge();
        renderCart();
      }
    } catch (e) {
      cart = [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SHOPPING CART (US-16, US-17)
  // ═══════════════════════════════════════════════════════════
  function cartCount() {
    return cart.reduce((n, i) => n + i.qty, 0);
  }
  function cartGrandTotal() {
    return cart.reduce((n, i) => n + Number(i.product.price) * i.qty, 0);
  }

  function updateCartBadge() {
    const count = cartCount();
    const badge = document.getElementById("cartBadge");
    badge.textContent = count;
    badge.style.display = count > 0 ? "flex" : "none";
  }

  function renderCart() {
    const empty = document.getElementById("cartEmpty");
    const items = document.getElementById("cartItems");
    const footer = document.getElementById("cartFooter");
    const total = document.getElementById("cartTotal");
    const orderBtn = document.getElementById("cartOrderBtn");

    if (!cart.length) {
      empty.style.display = "block";
      items.innerHTML = "";
      footer.style.display = "none";
      return;
    }
    empty.style.display = "none";
    footer.style.display = "block";
    total.textContent = `₦${cartGrandTotal().toLocaleString()}`;

    items.innerHTML = cart
      .map(
        (item, idx) => `
      <div class="cart-item" data-idx="${idx}">
        <img class="cart-item-img" src="${item.product.image_url || "assets/quint_img_allstar.jpg"}" alt="${item.product.name}" onerror="this.src='assets/quint_img_allstar.jpg'"/>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.product.name}</div>
          <div class="cart-item-cat">${item.product.category}</div>
          <div class="cart-item-price">₦${(Number(item.product.price) * item.qty).toLocaleString()}</div>
          <div class="cart-item-qty">
            <button class="qty-btn qty-minus" data-idx="${idx}">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn qty-plus" data-idx="${idx}">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-idx="${idx}" aria-label="Remove">&#10005;</button>
      </div>`,
      )
      .join("");

    items
      .querySelectorAll(".qty-minus")
      .forEach((b) =>
        b.addEventListener("click", () => changeQty(+b.dataset.idx, -1)),
      );
    items
      .querySelectorAll(".qty-plus")
      .forEach((b) =>
        b.addEventListener("click", () => changeQty(+b.dataset.idx, 1)),
      );
    items
      .querySelectorAll(".cart-item-remove")
      .forEach((b) =>
        b.addEventListener("click", () => removeFromCart(+b.dataset.idx)),
      );

    // Build WhatsApp order message
    const lines = cart
      .map(
        (i) =>
          `• ${i.product.name} (x${i.qty}) — ₦${(Number(i.product.price) * i.qty).toLocaleString()}`,
      )
      .join("\n");
    const msg = `Hello! I'd like to place an order:\n\n${lines}\n\n*Total: ₦${cartGrandTotal().toLocaleString()}*\n\nPlease share payment details. Thank you!`;
    orderBtn.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
  }

  function addToCart(product) {
    const existing = cart.find((i) => i.product.id === product.id);
    if (existing) {
      existing.qty++;
      showToast(`${product.name} — qty updated 🛒`);
    } else {
      cart.push({ product, qty: 1 });
      showToast(`${product.name} added to cart 🛒`);
    }
    updateCartBadge();
    renderCart();
    saveCart();
  }

  function changeQty(idx, delta) {
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    updateCartBadge();
    renderCart();
    saveCart();
  }

  function removeFromCart(idx) {
    cart.splice(idx, 1);
    updateCartBadge();
    renderCart();
    saveCart();
  }

  // Cart drawer open/close
  const cartDrawer = document.getElementById("cartDrawer");
  const cartOverlay = document.getElementById("cartOverlay");

  function openCart() {
    cartDrawer.classList.add("open");
    cartOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeCart() {
    cartDrawer.classList.remove("open");
    cartOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.getElementById("cartToggleBtn").addEventListener("click", openCart);
  document.getElementById("cartCloseBtn").addEventListener("click", closeCart);
  cartOverlay.addEventListener("click", closeCart);
  document.getElementById("cartClearBtn").addEventListener("click", () => {
    cart = [];
    updateCartBadge();
    renderCart();
    saveCart();
    showToast("Cart cleared");
  });

  // ═══════════════════════════════════════════════════════════
  //  PRODUCT QUICK-VIEW MODAL
  // ═══════════════════════════════════════════════════════════
  const productModal = document.getElementById("productModal");

  document
    .getElementById("modalClose")
    .addEventListener("click", () => productModal.classList.remove("open"));
  productModal.addEventListener("click", (e) => {
    if (e.target === productModal) productModal.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") productModal.classList.remove("open");
  });

  function openProductModal(p) {
    currentProduct = p;
    const inStock = p.is_in_stock !== false;

    document.getElementById("modalImg").src =
      p.image_url || "assets/quint_img_allstar.jpg";
    document.getElementById("modalImg").alt = p.name;
    document.getElementById("modalName").textContent = p.name;
    document.getElementById("modalCategory").textContent = p.category;
    document.getElementById("modalPrice").textContent = p.price
      ? `₦${Number(p.price).toLocaleString()}`
      : "";
    document.getElementById("modalDesc").textContent = p.description || "";

    // Stock badge
    const stockBadge = document.getElementById("modalStockBadge");
    stockBadge.style.display = inStock ? "none" : "block";

    // Video
    const videoWrap = document.getElementById("modalVideoWrap");
    const videoEl = document.getElementById("modalVideo");
    if (p.video_url) {
      videoEl.src = p.video_url;
      videoWrap.style.display = "block";
    } else {
      videoEl.src = "";
      videoWrap.style.display = "none";
    }

    // Actions vs out of stock
    const modalActions = document.getElementById("modalActions");
    const modalOos = document.getElementById("modalOos");
    if (inStock) {
      modalActions.style.display = "flex";
      modalOos.style.display = "none";
      const msg = encodeURIComponent(
        `Hello! I'm interested in "${p.name}"${p.price ? " — ₦" + Number(p.price).toLocaleString() : ""}. Please share more details.`,
      );
      document.getElementById("modalCta").href =
        `https://wa.me/${whatsappNumber}?text=${msg}`;
    } else {
      modalActions.style.display = "none";
      modalOos.style.display = "block";
      const msg = encodeURIComponent(
        `Hi! I'd like to be notified when "${p.name}" is back in stock. Please let me know!`,
      );
      document.getElementById("modalNotifyBtn").href =
        `https://wa.me/${whatsappNumber}?text=${msg}`;
    }

    productModal.classList.add("open");
  }

  // Add to cart from modal
  document.getElementById("modalAddToCart").addEventListener("click", () => {
    if (currentProduct) {
      addToCart(currentProduct);
      productModal.classList.remove("open");
      openCart();
    }
  });

  // Share product (US-21)
  document
    .getElementById("modalShareBtn")
    .addEventListener("click", async () => {
      if (!currentProduct) return;
      const shareText = `Check out "${currentProduct.name}" at Quintessence — ${currentProduct.price ? "₦" + Number(currentProduct.price).toLocaleString() + " " : ""}🌸\n\nOrder via WhatsApp: https://wa.me/${whatsappNumber}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Quintessence — ${currentProduct.name}`,
            text: shareText,
            url: window.location.href,
          });
        } catch (e) {
          /* cancelled */
        }
      } else {
        navigator.clipboard
          .writeText(shareText)
          .then(() => showToast("Link copied to clipboard! 📋"))
          .catch(() =>
            showToast("Share: " + shareText.slice(0, 60) + "…", "info"),
          );
      }
    });

  // ═══════════════════════════════════════════════════════════
  //  RENDER PRODUCTS with search + stock
  // ═══════════════════════════════════════════════════════════
  function renderProducts(products, filter = "all", search = "") {
    const grid = document.getElementById("productGrid");
    const bar = document.getElementById("productFilter");
    const cats = ["all", ...new Set(products.map((p) => p.category))];

    bar.innerHTML = cats
      .map(
        (c) =>
          `<button class="filter-btn${c === filter ? " active" : ""}" data-filter="${c}">${c === "all" ? "All" : c}</button>`,
      )
      .join("");
    bar.querySelectorAll(".filter-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const q = document.getElementById("productSearch").value;
        renderProducts(products, b.dataset.filter, q);
      }),
    );

    let list =
      filter === "all"
        ? products
        : products.filter((p) => p.category === filter);

    // Search filter (US-19)
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q),
      );
    }

    const emptyEl = document.getElementById("searchEmpty");
    const emptyTerm = document.getElementById("searchEmptyTerm");
    if (!list.length) {
      grid.innerHTML = "";
      if (q) {
        emptyEl.style.display = "block";
        emptyTerm.textContent = q;
      } else {
        grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#bbb;padding:2rem;">No products in this category yet.</p>`;
        emptyEl.style.display = "none";
      }
      return;
    }
    emptyEl.style.display = "none";

    grid.innerHTML = list
      .map((p) => {
        const inStock = p.is_in_stock !== false;
        const imgSrc = p.image_url || "";
        const imgTag = imgSrc
          ? `<img src="${imgSrc}" alt="${p.name}" onerror="var ph=this.parentNode.querySelector('.card-img-placeholder');this.style.display='none';if(ph)ph.style.display='flex'"/>
           <div class="card-img-placeholder" style="display:none;">🌸</div>`
          : `<div class="card-img-placeholder">🌸</div>`;
        return `
      <div class="card${inStock ? "" : " out-of-stock"}" data-id="${p.id}">
        ${imgTag}
        <div class="card-info">
          ${!inStock ? '<span class="card-stock-badge">Out of Stock</span>' : ""}
          <p class="card-name">${p.name}</p>
          ${p.price ? `<p class="card-price">₦${Number(p.price).toLocaleString()}</p>` : ""}
          <button class="cta-btn card-enquire"${!inStock ? " disabled" : ""}>${inStock ? "Enquire" : "Sold Out"}</button>
        </div>
      </div>`;
      })
      .join("");

    grid.querySelectorAll(".card").forEach((card, i) => {
      card.querySelector(".card-enquire").addEventListener("click", (e) => {
        e.stopPropagation();
        openProductModal(list[i]);
      });
      card.addEventListener("click", () => openProductModal(list[i]));
      setTimeout(() => card.classList.add("reveal", "visible"), i * 60);
    });
  }

  // ── Product search events ──────────────────────────────────
  const searchInput = document.getElementById("productSearch");
  const searchClear = document.getElementById("searchClear");
  let searchFilter = "all";

  searchInput.addEventListener("input", () => {
    const q = searchInput.value;
    searchClear.style.display = q ? "block" : "none";
    renderProducts(allProducts, searchFilter, q);
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.style.display = "none";
    renderProducts(allProducts, searchFilter, "");
    searchInput.focus();
  });

  // Track active filter for search
  document.getElementById("productFilter").addEventListener("click", (e) => {
    if (e.target.dataset.filter) searchFilter = e.target.dataset.filter;
  });

  // ═══════════════════════════════════════════════════════════
  //  RENDER BEST SELLERS
  // ═══════════════════════════════════════════════════════════
  function renderBestSellers(products) {
    const sellers = products.filter((p) => p.is_best_seller);
    const el = document.getElementById("bestSellersCarousel");
    if (!sellers.length) {
      el.innerHTML = `<p style="text-align:center;color:#ccc;padding:2rem;width:100%;font-size:0.9rem;">Best sellers will appear here once the admin marks products.</p>`;
      return;
    }
    el.innerHTML = sellers
      .map(
        (p) => `
      <div class="seller-card" data-id="${p.id}">
        <img
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"
          data-src="${p.image_url || "assets/quint_img_allstar.jpg"}"
          alt="${p.name}"
          loading="lazy"
          class="lazy-img"
          onerror="this.src='assets/quint_img_allstar.jpg'"/>
        <p>${p.name}</p>
        ${p.price ? `<span class="seller-price">₦${Number(p.price).toLocaleString()}</span>` : ""}
      </div>`,
      )
      .join("");
    el.querySelectorAll(".seller-card").forEach((card, i) => {
      card.addEventListener("click", () => openProductModal(sellers[i]));
      setTimeout(() => card.classList.add("reveal", "visible"), i * 90);
    });
    // Lazy load carousel images using IntersectionObserver
    const lazyImgs = el.querySelectorAll("img.lazy-img");
    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              img.classList.remove("lazy-img");
              obs.unobserve(img);
            }
          });
        },
        { rootMargin: "100px" },
      );
      lazyImgs.forEach((img) => obs.observe(img));
    } else {
      lazyImgs.forEach((img) => {
        img.src = img.dataset.src;
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER VIDEOS
  // ═══════════════════════════════════════════════════════════
  function renderVideos(videos) {
    if (!videos || !videos.length) return;
    document.getElementById("videoGrid").innerHTML = videos
      .map(
        (v) => `
      <div class="video-wrap">
        <div class="video-box">
          <video controls muted playsinline preload="none">
            <source src="${v.video_url}" type="video/mp4">
          </video>
        </div>
        <p class="video-title">${v.title}</p>
      </div>`,
      )
      .join("");
  }

  // ═══════════════════════════════════════════════════════════
  //  EMPTY STATE
  // ═══════════════════════════════════════════════════════════
  function renderEmptyState() {
    document.getElementById("productGrid").innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;">
        <p style="font-size:2rem;">🛍️</p>
        <p style="color:#bbb;margin-top:0.5rem;">No products yet.</p>
        <p style="color:#ccc;font-size:0.85rem;margin-top:0.3rem;">Add products from the Admin Panel.</p>
      </div>`;
    document.getElementById("bestSellersCarousel").innerHTML = `
      <p style="text-align:center;color:#ccc;padding:2rem;width:100%;font-size:0.9rem;">Best sellers will appear here once the admin adds products.</p>`;
  }

  // ═══════════════════════════════════════════════════════════
  //  LOAD DATA
  // ═══════════════════════════════════════════════════════════
  async function loadData() {
    if (!db) {
      renderEmptyState();
      return;
    }
    try {
      const { data: products, error: pe } = await db
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (pe) throw pe;
      if (products && products.length > 0) {
        allProducts = products;
        renderProducts(products);
        renderBestSellers(products);
      } else {
        allProducts = [];
        renderEmptyState();
      }
      const { data: videos, error: ve } = await db
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false });
      if (!ve && videos && videos.length > 0) renderVideos(videos);
    } catch (err) {
      console.warn("Data load failed:", err.message);
      renderEmptyState();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  TESTIMONIALS
  // ═══════════════════════════════════════════════════════════
  document.querySelectorAll(".review-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("tReview").value = chip.dataset.text;
      document
        .querySelectorAll(".review-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  document
    .querySelectorAll("#testimonialGrid .testimonial-card")
    .forEach((card) => {
      addDeleteBtn(card, true);
    });

  function addDeleteBtn(card, adminOnly = false, dbId = null) {
    const btn = document.createElement("button");
    btn.className =
      "review-delete-btn" + (adminOnly ? " admin-only-delete" : "");
    btn.innerHTML = "&#10005;";
    btn.title = adminOnly ? "Admin: Remove review" : "Remove your review";
    if (adminOnly) btn.style.display = "none";
    btn.addEventListener("click", async () => {
      if (dbId && db) {
        await db.from("reviews").delete().eq("id", dbId);
      }
      card.style.transition = "opacity 0.3s, transform 0.3s";
      card.style.opacity = "0";
      card.style.transform = "scale(0.9)";
      setTimeout(() => card.remove(), 300);
    });
    card.appendChild(btn);
  }

  function showAdminDeleteButtons() {
    document
      .querySelectorAll(".admin-only-delete")
      .forEach((b) => (b.style.display = ""));
  }
  function hideAdminDeleteButtons() {
    document
      .querySelectorAll(".admin-only-delete")
      .forEach((b) => (b.style.display = "none"));
  }

  async function loadReviews() {
    if (!db) return;
    try {
      const { data } = await db
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (!data || !data.length) return;
      const grid = document.getElementById("testimonialGrid");
      data.forEach((r) => {
        const card = document.createElement("div");
        card.className = "testimonial-card";
        card.innerHTML = `<p>"${r.review}"</p><span>— ${r.name}${r.city ? ", " + r.city : ""}</span>`;
        revealObs.observe(card);
        grid.appendChild(card);
        addDeleteBtn(card, true, r.id);
      });
    } catch (e) {
      console.warn("Reviews:", e.message);
    }
  }

  document
    .getElementById("testimonialForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("tName").value.trim();
      const city = document.getElementById("tCity").value.trim();
      const review = document.getElementById("tReview").value.trim();
      if (!name || !review) {
        showToast("Please fill in name and review.", "error");
        return;
      }

      const btn = e.target.querySelector(".t-submit-btn");
      btn.textContent = "Submitting…";
      btn.disabled = true;

      if (db) {
        const { data, error } = await db
          .from("reviews")
          .insert([{ name, city, review }])
          .select()
          .single();
        if (!error && data) {
          const grid = document.getElementById("testimonialGrid");
          const card = document.createElement("div");
          card.className = "testimonial-card";
          card.innerHTML = `<p>"${review}"</p><span>— ${name}${city ? ", " + city : ""}</span>`;
          revealObs.observe(card);
          grid.insertBefore(card, grid.firstChild);
          addDeleteBtn(card, true, data.id);
        }
      }

      btn.textContent = "Submit Review";
      btn.disabled = false;
      document.getElementById("testimonialForm").reset();
      document.getElementById("tSuccessMsg").style.display = "block";
      setTimeout(
        () => (document.getElementById("tSuccessMsg").style.display = "none"),
        4000,
      );
      document
        .querySelectorAll(".review-chip")
        .forEach((c) => c.classList.remove("active"));
    });

  // ═══════════════════════════════════════════════════════════
  //  NEWSLETTER
  // ═══════════════════════════════════════════════════════════
  document
    .getElementById("newsletterForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("newsletterEmail").value.trim();
      if (!email) return;
      const btn = e.target.querySelector("button");
      btn.textContent = "Subscribing…";
      btn.disabled = true;
      if (db) {
        const { error } = await db.from("subscribers").insert([{ email }]);
        btn.textContent = "Subscribe";
        btn.disabled = false;
        if (error && error.code === "23505") {
          showToast("Already subscribed! 💕");
        } else if (error) {
          showToast("Error: " + error.message, "error");
        } else {
          document.getElementById("newsletterForm").style.display = "none";
          document.getElementById("newsletterSuccess").style.display = "block";
        }
      } else {
        btn.textContent = "Subscribe";
        btn.disabled = false;
        showToast("Subscribed! 💕");
      }
    });

  // ═══════════════════════════════════════════════════════════
  //  ADMIN — AUTH
  // ═══════════════════════════════════════════════════════════
  const openAdminOverlay = () => {
    document.getElementById("adminOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
    sessionStorage.setItem("quint_admin_open", "1");
    checkAdminSession();
  };
  document
    .getElementById("openAdminBtn")
    .addEventListener("click", openAdminOverlay);
  document
    .getElementById("openAdminBtnMobile")
    ?.addEventListener("click", () => {
      mobileMenu.classList.remove("open");
      openAdminOverlay();
    });

  const closeAdmin = () => {
    document.getElementById("adminOverlay").classList.remove("open");
    document.body.style.overflow = "";
    sessionStorage.removeItem("quint_admin_open");
  };
  document
    .getElementById("closeAdminBtn")
    .addEventListener("click", closeAdmin);
  document
    .getElementById("backToSiteFromLogin")
    .addEventListener("click", closeAdmin);

  async function checkAdminSession() {
    if (!db) return;
    const {
      data: { session },
    } = await db.auth.getSession();
    if (session) showAdminPanel(session.user);
  }

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const errEl = document.getElementById("loginError");
    errEl.textContent = "";
    if (!email || !password) {
      errEl.textContent = "Please fill in both fields.";
      return;
    }
    if (!db) {
      errEl.textContent = "Backend not connected.";
      return;
    }
    const btn = document.getElementById("loginBtn");
    btn.textContent = "Logging in…";
    btn.disabled = true;
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password,
    });
    btn.textContent = "Login";
    btn.disabled = false;
    if (error) errEl.textContent = error.message;
    else showAdminPanel(data.user);
  });

  ["loginEmail", "loginPassword"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("loginBtn").click();
    });
  });

  function showAdminPanel(user) {
    document.getElementById("adminLoginScreen").style.display = "none";
    document.getElementById("adminPanel").style.display = "flex";
    document.getElementById("adminUserBadge").textContent = user.email;
    showAdminDeleteButtons();
    const savedTab = sessionStorage.getItem("quint_admin_tab") || "products";
    switchTab(savedTab);
    loadAdminProducts();
    loadAdminVideos();
    loadAdminSubscribers();
  }

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (db) await db.auth.signOut();
    hideAdminDeleteButtons();
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("adminLoginScreen").style.display = "flex";
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
  });

  // ── Admin tabs ─────────────────────────────────────────────
  function switchTab(tab) {
    document
      .querySelectorAll(".sidebar-link")
      .forEach((l) => l.classList.toggle("active", l.dataset.tab === tab));
    document
      .querySelectorAll(".tab-content")
      .forEach((t) => t.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
    document.getElementById("adminTabTitle").textContent =
      {
        products: "Products",
        videos: "Videos",
        subscribers: "Subscribers",
        settings: "Settings",
      }[tab] || tab;
    sessionStorage.setItem("quint_admin_tab", tab);
  }
  document
    .querySelectorAll(".sidebar-link")
    .forEach((link) =>
      link.addEventListener("click", () => switchTab(link.dataset.tab)),
    );

  // ═══════════════════════════════════════════════════════════
  //  ADMIN — AUTO-FILL DESCRIPTION
  // ═══════════════════════════════════════════════════════════
  const CATEGORY_DESCRIPTIONS = {
    "Air Freshener": [
      "A premium air freshener that instantly transforms any space with a long-lasting, captivating fragrance. Perfect for homes, cars, and offices.",
      "Banish stale air and replace it with this rich, mood-lifting scent. One spritz and your entire space feels refreshed and inviting.",
      "Crafted to eliminate odours and leave behind a clean, luxurious aroma. Your space deserves to smell as good as you do.",
    ],
    "Baby Cologne": [
      "A gentle, alcohol-free cologne specially formulated for delicate baby skin. Soft, sweet, and safe for everyday use.",
      "Designed with your little one in mind — this baby cologne is mild, hypoallergenic, and irresistibly sweet.",
    ],
    "Bloom Butter": [
      "A rich, whipped hair growth butter infused with nourishing botanicals. Seals in moisture, strengthens strands, and promotes healthy growth from root to tip.",
      "Indulge your hair in this deeply moisturising Bloom Butter — packed with natural ingredients that stimulate the scalp.",
    ],
    "Body Mist": [
      "A light, refreshing body mist that envelops you in a soft cloud of fragrance. Great for layering or wearing solo on warm days.",
      "Hydrating and aromatic — this body mist leaves skin smelling fresh and feeling soft. Ideal for an all-over spritz after a shower.",
    ],
    "Body Spray": [
      "A bold, long-lasting body spray that makes a statement. Crisp, confident, and designed for those who love to be noticed.",
      "Everyday luxury in a bottle — this body spray gives you full fragrance coverage with just a few sprays.",
    ],
    "Hand Cream": [
      "A fast-absorbing, non-greasy hand cream that deeply moisturises and softens dry skin while leaving a subtle, lasting fragrance.",
      "Treat your hands to this luxuriously rich cream — packed with skin-loving ingredients that repair, hydrate, and protect all day long.",
      "From rough to smooth in seconds. This nourishing hand cream restores moisture, strengthens nails, and lingers with a beautiful scent.",
    ],
    Incense: [
      "Hand-selected incense sticks that fill any room with a rich, calming aroma. Perfect for meditation, prayer, or simply unwinding.",
      "These fragrant incense sticks burn slow and steady, releasing a warm, inviting scent that lingers long after.",
    ],
    "Perfume Oils": [
      "A richly concentrated perfume oil that glides on the skin and builds into a deep, lasting scent. Long-wearing formula that keeps you smelling amazing for hours.",
      "Skin-loving perfume oil with a warm, sensual depth. A little goes a long way — one drop and you're set for the day.",
    ],
  };

  function getAutoDescription(name, category) {
    const pool = CATEGORY_DESCRIPTIONS[category];
    if (!pool) return "";
    let hash = 0;
    for (let i = 0; i < name.length; i++)
      hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    return pool[Math.abs(hash) % pool.length];
  }

// ── Description Helper (AI / Fix) ──────────────────────────
function setDescHelperTab(tab) {
  const aiBtn = document.getElementById("descTabAi");
  const fixBtn = document.getElementById("descTabFix");
  const aiPanel = document.getElementById("descPanelAi");
  const fixPanel = document.getElementById("descPanelFix");
  if (tab === "fix") {
    aiBtn.classList.remove("active");
    fixBtn.classList.add("active");
    aiPanel.style.display = "none";
    fixPanel.style.display = "block";
  } else {
    fixBtn.classList.remove("active");
    aiBtn.classList.add("active");
    fixPanel.style.display = "none";
    aiPanel.style.display = "block";
  }
}

function closeDescHelperModal() {
  document.getElementById("descHelperModal").classList.remove("open");
}

document.getElementById("closeDescHelperModal")?.addEventListener("click", closeDescHelperModal);
document.getElementById("descTabAi")?.addEventListener("click", () => setDescHelperTab("ai"));
document.getElementById("descTabFix")?.addEventListener("click", () => setDescHelperTab("fix"));

// Optional: allow ESC to close (doesn't affect Add Product modal)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDescHelperModal();
});

async function runAiDescriptionDraft() {
  const name = document.getElementById("productName").value.trim();
  const rawCat = document.getElementById("productCategory").value;
  const category =
    rawCat === "__other__"
      ? document.getElementById("productCategoryCustom").value.trim() ||
        "fragrance product"
      : rawCat;

  if (!name && !category) {
    showToast("Enter a product name or category first.", "error");
    return;
  }

  const btn = document.getElementById("descAiGenerateBtn");
  const status = document.getElementById("descAiStatus");
  const draft = document.getElementById("descAiDraft");

  btn.disabled = true;
  btn.textContent = "⏳ Generating…";
  status.textContent = "";
  status.style.color = "";

  try {
    const res = await fetch(AI_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ name, category }),
    });

    const data = await res.json();

    if (data.description) {
      draft.value = data.description;
      status.textContent = "✓ AI Generated";
      status.style.color = "#2e7d32";
    } else {
      const errMsg = data.error || "No description returned";
      console.error("AI Generation error:", errMsg);
      if (data.raw) console.error("AI raw response:", data.raw);
      const fallback = getAutoDescription(name, category);
      if (fallback) {
        draft.value = fallback;
        status.textContent = "AI unavailable — used template";
        status.style.color = "#e65100";
        status.title = errMsg;
      } else {
        showToast("AI error: " + errMsg.slice(0, 120), "error");
      }
    }
  } catch (err) {
    console.error("AI fetch error:", err.message);
    const fallback = getAutoDescription(name, category);
    if (fallback) {
      draft.value = fallback;
      status.textContent = "Using template (AI service unreachable)";
      status.style.color = "#888";
    } else {
      showToast("AI service unreachable.", "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
    setTimeout(() => {
      status.textContent = "";
      status.style.color = "";
    }, 5000);
  }
}

document.getElementById("descAiGenerateBtn")?.addEventListener("click", runAiDescriptionDraft);

// Apply AI draft to main description
document.getElementById("descApplyAiBtn")?.addEventListener("click", () => {
  const draft = document.getElementById("descAiDraft").value.trim();
  if (!draft) return showToast("Nothing to apply yet.", "error");
  const descEl = document.getElementById("productDesc");
  descEl.value = draft;
  descEl.dataset.autoFilled = "false";
  document.getElementById("aiDescStatus").textContent = "✓ Applied";
  document.getElementById("aiDescStatus").style.color = "#2e7d32";
  setTimeout(() => {
    document.getElementById("aiDescStatus").textContent = "";
    document.getElementById("aiDescStatus").style.color = "";
  }, 2500);
  closeDescHelperModal();
});

// Fix: lightweight cleanup (no external calls)
function fixDescriptionText(text) {
  let t = (text || "").trim();
  if (!t) return "";
  t = t.replace(/\s+/g, " ");            // collapse whitespace
  t = t.replace(/\s+([,.;:!?])/g, "$1"); // remove space before punctuation
  t = t.replace(/([,.;:!?])(\S)/g, "$1 $2"); // ensure space after punctuation
  // Sentence casing: capitalize first character only (avoid changing brand names)
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Ensure ends with punctuation
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

document.getElementById("descApplyFixBtn")?.addEventListener("click", () => {
  const draftEl = document.getElementById("descFixDraft");
  const fixed = fixDescriptionText(draftEl.value);
  if (!fixed) return showToast("Nothing to fix.", "error");
  const descEl = document.getElementById("productDesc");
  descEl.value = fixed;
  descEl.dataset.autoFilled = "false";
  closeDescHelperModal();
});

// When opening helper modal, keep fix draft in sync if user switches tabs
document.getElementById("descTabFix")?.addEventListener("click", () => {
  const current = document.getElementById("productDesc").value || "";
  const fixDraft = document.getElementById("descFixDraft");
  if (!fixDraft.value) fixDraft.value = current.trim();
});



  function maybeAutoFillDesc() {
    const name = document.getElementById("productName").value.trim();
    const rawCat = document.getElementById("productCategory").value;
    const category = rawCat === "__other__" ? "" : rawCat;
    const descEl = document.getElementById("productDesc");
    if (
      name &&
      category &&
      (!descEl.value.trim() || descEl.dataset.autoFilled === "true")
    ) {
      descEl.value = getAutoDescription(name, category);
      descEl.dataset.autoFilled = "true";
    }
  }

  document
    .getElementById("productName")
    .addEventListener("blur", maybeAutoFillDesc);
  document
    .getElementById("productCategory")
    .addEventListener("change", function () {
      const custom = document.getElementById("productCategoryCustom");
      if (this.value === "__other__") {
        custom.style.display = "block";
        custom.focus();
      } else {
        custom.style.display = "none";
        custom.value = "";
      }
      maybeAutoFillDesc();
    });
  document.getElementById("productDesc").addEventListener("input", function () {
    this.dataset.autoFilled = "false";
  });

  // ── AI Description Generator ───────────────────────────────
  // Routes through a Supabase Edge Function to avoid browser CORS block.
  // Deploy: supabase functions deploy ai-description
  // Then set: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  const AI_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-description`;

  document.getElementById("aiDescBtn").addEventListener("click", () => {
    // Open the Description Helper modal instead of overwriting immediately
    const modal = document.getElementById("descHelperModal");
    const aiDraft = document.getElementById("descAiDraft");
    const fixDraft = document.getElementById("descFixDraft");
    const current = document.getElementById("productDesc").value || "";
    aiDraft.value = "";
    fixDraft.value = current.trim();
    // default to AI tab
    setDescHelperTab("ai");
    modal.classList.add("open");
  });

  // Video title chips
  document.querySelectorAll("#videoFormModal .review-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("videoTitle").value = chip.dataset.text;
      document
        .querySelectorAll("#videoFormModal .review-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });
  document.querySelectorAll(".edit-video-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("editVideoTitle").value = chip.dataset.text;
      document
        .querySelectorAll(".edit-video-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  ADMIN — PRODUCTS CRUD (with stock toggle)
  // ═══════════════════════════════════════════════════════════
  let editingProductId = null;

  async function loadAdminProducts() {
    const tbody = document.getElementById("productsTableBody");
    tbody.innerHTML =
      '<tr><td colspan="7" class="loading-cell">Loading…</td></tr>';
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="error-cell">${error.message}</td></tr>`;
      return;
    }
    if (!data.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="loading-cell">No products yet. Click "+ Add Product".</td></tr>';
      return;
    }
    tbody.innerHTML = data
      .map((p) => {
        const inStock = p.is_in_stock !== false;
        return `
      <tr>
        <td><img src="${p.image_url || ""}" class="table-thumb" alt="${p.name}" onerror="this.style.display='none'"/></td>
        <td><strong>${p.name}</strong></td>
        <td>${p.category}</td>
        <td>₦${Number(p.price).toLocaleString()}</td>
        <td><span class="badge ${p.is_best_seller ? "badge-green" : "badge-grey"}">${p.is_best_seller ? "Yes" : "No"}</span></td>
        <td>
          <button class="stock-toggle-btn ${inStock ? "in-stock" : "out-stock"}" data-id="${p.id}" data-stock="${inStock}">
            ${inStock ? "✅ In Stock" : "❌ Out of Stock"}
          </button>
        </td>
        <td class="actions-cell">
          <div class="actions-cell-inner">
            <button class="action-btn edit-btn" data-id="${p.id}">✏️ Edit</button>
            <button class="action-btn delete-btn" data-id="${p.id}">🗑️ Delete</button>
          </div>
        </td>
      </tr>`;
      })
      .join("");

    tbody
      .querySelectorAll(".edit-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          openEditProduct(btn.dataset.id, data),
        ),
      );
    tbody
      .querySelectorAll(".delete-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () => deleteProduct(btn.dataset.id)),
      );

    // US-20/US-35: Stock toggle in admin
    tbody.querySelectorAll(".stock-toggle-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const newStock = btn.dataset.stock === "true" ? false : true;
        const { error } = await db
          .from("products")
          .update({ is_in_stock: newStock })
          .eq("id", btn.dataset.id);
        if (error) {
          if (error.message.includes("is_in_stock")) {
            showToast(
              "Run the SQL migration first — see the SQL guide below.",
              "error",
            );
          } else {
            showToast("Error: " + error.message, "error");
          }
          return;
        }
        showToast(
          newStock ? "✅ Marked as In Stock" : "❌ Marked as Out of Stock",
        );
        loadAdminProducts();
        loadData();
      }),
    );
  }

  document
    .getElementById("openAddProductModal")
    .addEventListener("click", () => {
      editingProductId = null;
      document.getElementById("productModalTitle").textContent = "Add Product";
      document.getElementById("productForm").reset();
      document.getElementById("imagePreview").style.display = "none";
      document.getElementById("imageCropWrap").style.display = "none";
      document.getElementById("cropReEditBtn").style.display = "none";
      cropState.croppedBlob = null;
      document.getElementById("existingImageUrl").value = "";
      document.getElementById("existingVideoUrl").value = "";
      document.getElementById("productVideoPreview").style.display = "none";
      document.getElementById("productDesc").dataset.autoFilled = "false";
      document.getElementById("productInStock").checked = true;
      document.getElementById("productFormModal").classList.add("open");
    });

  function openEditProduct(id, data) {
    const p = data.find((x) => x.id === id);
    if (!p) return;
    editingProductId = id;
    document.getElementById("productModalTitle").textContent = "Edit Product";
    document.getElementById("productName").value = p.name;
    document.getElementById("productCategory").value = p.category || "";
    document.getElementById("productPrice").value = p.price;
    document.getElementById("productDesc").value = p.description || "";
    document.getElementById("productBestSeller").checked = p.is_best_seller;
    document.getElementById("productInStock").checked = p.is_in_stock !== false;
    document.getElementById("existingImageUrl").value = p.image_url || "";
    document.getElementById("existingVideoUrl").value = p.video_url || "";
    // Reset crop UI/state to avoid leaking previous image edits
    document.getElementById("imageCropWrap").style.display = "none";
    cropState.img = null;
    cropState.croppedBlob = null;
    document.getElementById("cropReEditBtn").style.display = "none";

    if (p.image_url) {
      document.getElementById("imagePreview").src = p.image_url;
      document.getElementById("imagePreview").style.display = "block";
      document.getElementById("cropReEditBtn").style.display = "inline-block";
    } else {
      document.getElementById("imagePreview").src = "";
      document.getElementById("imagePreview").style.display = "none";
    }
    if (p.video_url) {
      document.getElementById("productVideoPreview").src = p.video_url;
      document.getElementById("productVideoPreview").style.display = "block";
    } else {
      document.getElementById("productVideoPreview").src = "";
      document.getElementById("productVideoPreview").style.display = "none";
    }
    document.getElementById("productFormModal").classList.add("open");
  }

  // ── Image crop tool ────────────────────────────────────────
  let cropState = {
    img: null,
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    croppedBlob: null,
  };

  function drawCrop() {
    const canvas = document.getElementById("cropCanvas");
    const ctx = canvas.getContext("2d");
    const { img, scale, rotation, offsetX, offsetY } = cropState;
    if (!img) return;
    const SIZE = 300;
    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(SIZE / 2 + offsetX, SIZE / 2 + offsetY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    ctx.strokeStyle = "rgba(196,88,122,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }

  function initCropCanvas(src) {
    // NOTE: Canvas export (toBlob) will fail if the source image is cross-origin without CORS.
    // We try to fetch the image into a same-origin Blob URL first; if that fails, we fall back
    // to direct loading and disable export gracefully if the canvas becomes tainted.
    const resolveSrcForCanvas = async (raw) => {
      if (!raw) return null;

      // Already a blob/data URL (safe)
      if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;

      // Try to fetch remote URLs into a blob URL so the canvas can be exported
      const isRemote = /^https?:\/\//i.test(raw);
      if (isRemote) {
        try {
          const res = await fetch(raw, { mode: "cors", cache: "no-store" });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          // Keep reference to revoke later
          cropState._resolvedObjectUrl && URL.revokeObjectURL(cropState._resolvedObjectUrl);
          cropState._resolvedObjectUrl = objUrl;
          return objUrl;
        } catch (e) {
          // CORS/network might block it; fall back to direct URL
          return raw;
        }
      }

      return raw;
    };

    (async () => {
      const resolved = await resolveSrcForCanvas(src);
      if (!resolved) return;

      const img = new Image();
      // Helps when remote server supports CORS
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const SIZE = 300;
        const fit = Math.min(SIZE / img.width, SIZE / img.height) * 0.9;
        cropState = {
          ...cropState,
          img,
          scale: fit,
          rotation: 0,
          offsetX: 0,
          offsetY: 0,
          dragging: false,
          lastX: 0,
          lastY: 0,
          sourceSrc: src,
          resolvedSrc: resolved,
        };
        drawCrop();
      };

      img.onerror = () => {
        cropState = { ...cropState, img: null, croppedBlob: null };
        showToast("Couldn't load this image for editing. Please try another image.", "error");
      };

      img.src = resolved;
    })();
  }

  document.getElementById("productImage").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
      document.getElementById("imagePreview").style.display = "none";
      document.getElementById("imageCropWrap").style.display = "block";
      initCropCanvas(ev.target.result);
    };
    r.readAsDataURL(file);
  });

  const cropCanvas = document.getElementById("cropCanvas");
  cropCanvas.addEventListener("mousedown", (e) => {
    cropState.dragging = true;
    cropState.lastX = e.clientX;
    cropState.lastY = e.clientY;
  });
  cropCanvas.addEventListener("mousemove", (e) => {
    if (!cropState.dragging) return;
    cropState.offsetX += e.clientX - cropState.lastX;
    cropState.offsetY += e.clientY - cropState.lastY;
    cropState.lastX = e.clientX;
    cropState.lastY = e.clientY;
    drawCrop();
  });
  cropCanvas.addEventListener("mouseup", () => (cropState.dragging = false));
  cropCanvas.addEventListener("mouseleave", () => (cropState.dragging = false));
  cropCanvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      cropState.dragging = true;
      cropState.lastX = e.touches[0].clientX;
      cropState.lastY = e.touches[0].clientY;
    },
    { passive: false },
  );
  cropCanvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (!cropState.dragging) return;
      cropState.offsetX += e.touches[0].clientX - cropState.lastX;
      cropState.offsetY += e.touches[0].clientY - cropState.lastY;
      cropState.lastX = e.touches[0].clientX;
      cropState.lastY = e.touches[0].clientY;
      drawCrop();
    },
    { passive: false },
  );
  cropCanvas.addEventListener("touchend", () => (cropState.dragging = false));

  document.getElementById("cropZoomIn").addEventListener("click", () => {
    cropState.scale = Math.min(cropState.scale * 1.15, 8);
    drawCrop();
  });
  document.getElementById("cropZoomOut").addEventListener("click", () => {
    cropState.scale = Math.max(cropState.scale * 0.87, 0.1);
    drawCrop();
  });
  document.getElementById("cropRotateLeft").addEventListener("click", () => {
    cropState.rotation -= 90;
    drawCrop();
  });
  document.getElementById("cropRotateRight").addEventListener("click", () => {
    cropState.rotation += 90;
    drawCrop();
  });

  document.getElementById("cropApply").addEventListener("click", () => {
    const canvas = document.getElementById("cropCanvas");

    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            // Happens when canvas is tainted or browser refuses export
            cropState.croppedBlob = null;
            showToast(
              "This image can't be exported after editing (likely due to source permissions). Please upload the image file instead.",
              "error",
            );
            return;
          }

          cropState.croppedBlob = blob;
          const url = URL.createObjectURL(blob);
          document.getElementById("imagePreview").src = url;
          document.getElementById("imagePreview").style.display = "block";
          document.getElementById("imageCropWrap").style.display = "none";
          const __applyRow = document.getElementById("cropApplyRow"); if (__applyRow) __applyRow.style.display = "none";
        },
        "image/jpeg",
        0.88,
      );
    } catch (e) {
      cropState.croppedBlob = null;
      showToast(
        "This image can't be exported after editing (likely due to source permissions). Please upload the image file instead.",
        "error",
      );
    }
  });

  document.getElementById("cropReEditBtn").addEventListener("click", () => {
    const wrap = document.getElementById("imageCropWrap");
    const preview = document.getElementById("imagePreview");
    const src = (document.getElementById("existingImageUrl").value || preview.src || "").trim();
    wrap.style.display = "block";
    preview.style.display = "none";
    document.getElementById("cropReEditBtn").style.display = "none";
    // Re-initialize crop state from the CURRENT image, not a stale previous session
    if (src) initCropCanvas(src);
  });

// Product video preview
  document
    .getElementById("productVideoFile")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      const prev = document.getElementById("productVideoPreview");
      if (file) {
        prev.src = URL.createObjectURL(file);
        prev.style.display = "block";
      } else {
        prev.src = "";
        prev.style.display = "none";
      }
    });

  // Product form submit
  document
    .getElementById("productForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("productName").value.trim();
      const rawCat = document.getElementById("productCategory").value;
      const catCustom = document
        .getElementById("productCategoryCustom")
        .value.trim();
      const category = rawCat === "__other__" ? catCustom : rawCat;
      const price = parseFloat(document.getElementById("productPrice").value);
      const description = document.getElementById("productDesc").value.trim();
      const is_best_seller =
        document.getElementById("productBestSeller").checked;
      const is_in_stock = document.getElementById("productInStock").checked;

      if (!name || !category || isNaN(price)) {
        showToast("Please fill in required fields.", "error");
        return;
      }

      const btn = document.getElementById("saveProductBtn");
      btn.textContent = "Saving…";
      btn.disabled = true;

      let image_url = document.getElementById("existingImageUrl").value || "";

      // Auto-apply crop if the canvas is still showing (user skipped clicking Apply)
      if (cropState.img && !cropState.croppedBlob) {
        const canvas = document.getElementById("cropCanvas");
        
if (cropState.img && !cropState.croppedBlob) {
  const canvas = document.getElementById("cropCanvas");
  try {
    cropState.croppedBlob = await new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, "image/jpeg", 0.88);
      } catch (e) {
        resolve(null);
      }
    });
    if (!cropState.croppedBlob) {
      showToast(
        "This image can't be exported after editing (likely due to source permissions). Please upload the image file instead.",
        "error",
      );
    }
  } catch (e) {
    cropState.croppedBlob = null;
    showToast(
      "This image can't be exported after editing (likely due to source permissions). Please upload the image file instead.",
      "error",
    );
  }
}}

      if (cropState.croppedBlob) {
        const filename = `product_${Date.now()}.jpg`;
        const { error: ue } = await db.storage
          .from("products")
          .upload(filename, cropState.croppedBlob, { upsert: true });
        if (ue) {
          showToast("Image upload failed: " + ue.message, "error");
          btn.textContent = "Save Product";
          btn.disabled = false;
          return;
        }
        image_url = db.storage.from("products").getPublicUrl(filename)
          .data.publicUrl;
      } else {
        // Fallback: upload the raw selected file directly if canvas not used
        const rawFile = document.getElementById("productImage").files[0];
        if (rawFile && !image_url) {
          const filename = `product_${Date.now()}.${rawFile.name.split(".").pop() || "jpg"}`;
          const { error: ue } = await db.storage
            .from("products")
            .upload(filename, rawFile, {
              upsert: true,
              contentType: rawFile.type,
            });
          if (ue) {
            showToast("Image upload failed: " + ue.message, "error");
            btn.textContent = "Save Product";
            btn.disabled = false;
            return;
          }
          image_url = db.storage.from("products").getPublicUrl(filename)
            .data.publicUrl;
        }
      }

      let video_url = document.getElementById("existingVideoUrl").value || null;
      const videoFile = document.getElementById("productVideoFile").files[0];
      if (videoFile) {
        const filename = `pv_${Date.now()}.${videoFile.name.split(".").pop()}`;
        const { error: ve } = await db.storage
          .from("products")
          .upload(filename, videoFile, { upsert: true });
        if (!ve)
          video_url = db.storage.from("products").getPublicUrl(filename)
            .data.publicUrl;
      }

      const payload = {
        name,
        category,
        price,
        description,
        is_best_seller,
        is_in_stock,
        image_url,
        video_url,
      };
      let error;
      if (editingProductId)
        ({ error } = await db
          .from("products")
          .update(payload)
          .eq("id", editingProductId));
      else ({ error } = await db.from("products").insert([payload]));

      btn.textContent = "Save Product";
      btn.disabled = false;
      if (error) {
        if (error.message && error.message.includes("is_in_stock")) {
          showToast(
            "⚠️ Run SQL migration first: ALTER TABLE products ADD COLUMN IF NOT EXISTS is_in_stock BOOLEAN DEFAULT true;",
            "error",
          );
        } else {
          showToast("Error: " + error.message, "error");
        }
      } else {
        showToast(editingProductId ? "Product updated ✅" : "Product added ✅");
        closeProductModal();
        loadAdminProducts();
        loadData();
      }
    });

  async function deleteProduct(id) {
    if (!confirm("Delete this product permanently?")) return;
    const { error } = await db.from("products").delete().eq("id", id);
    if (error) showToast("Error: " + error.message, "error");
    else {
      showToast("Product deleted.");
      loadAdminProducts();
      loadData();
    }
  }

  function closeProductModal() {
    document.getElementById("productFormModal").classList.remove("open");
    // Reset image editing state
    document.getElementById("imageCropWrap").style.display = "none";
    document.getElementById("cropReEditBtn").style.display = "none";
    cropState.img = null;
    cropState.croppedBlob = null;
  }
  document
    .getElementById("closeProductModal")
    .addEventListener("click", closeProductModal);
  document
    .getElementById("cancelProductModal")
    .addEventListener("click", closeProductModal);
  document.getElementById("productFormModal").addEventListener("click", (e) => {
    // Do not close on backdrop click (prevents accidental loss of work)
    if (e.target === document.getElementById("productFormModal")) return;
  });

// ═══════════════════════════════════════════════════════════
  //  ADMIN — VIDEOS CRUD
  // ═══════════════════════════════════════════════════════════
  async function loadAdminVideos() {
    const tbody = document.getElementById("videosTableBody");
    tbody.innerHTML =
      '<tr><td colspan="4" class="loading-cell">Loading…</td></tr>';
    const { data, error } = await db
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="4" class="error-cell">${error.message}</td></tr>`;
      return;
    }
    if (!data.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="loading-cell">No videos yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data
      .map(
        (v) => `
      <tr>
        <td><video src="${v.video_url}" class="table-video-thumb" muted preload="metadata"></video></td>
        <td><strong>${v.title}</strong></td>
        <td>${new Date(v.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
        <td class="actions-cell"><div class="actions-cell-inner">
          <button class="action-btn edit-btn" data-id="${v.id}" data-title="${v.title.replace(/"/g, "&quot;")}">✏️ Edit</button>
          <button class="action-btn delete-btn" data-id="${v.id}">🗑️ Delete</button>
        </div></td>
      </tr>`,
      )
      .join("");
    tbody
      .querySelectorAll(".edit-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          openEditVideoModal(btn.dataset.id, btn.dataset.title),
        ),
      );
    tbody
      .querySelectorAll(".delete-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () => deleteVideo(btn.dataset.id)),
      );
  }

  function openEditVideoModal(id, title) {
    document.getElementById("editVideoId").value = id;
    document.getElementById("editVideoTitle").value = title;
    document
      .querySelectorAll(".edit-video-chip")
      .forEach((c) => c.classList.remove("active"));
    document.getElementById("editVideoModal").classList.add("open");
  }

  document
    .getElementById("saveEditVideoBtn")
    .addEventListener("click", async () => {
      const id = document.getElementById("editVideoId").value;
      const title = document.getElementById("editVideoTitle").value.trim();
      if (!title) {
        showToast("Please enter a title.", "error");
        return;
      }
      const btn = document.getElementById("saveEditVideoBtn");
      btn.textContent = "Saving…";
      btn.disabled = true;

      const newFile = document.getElementById("editVideoFile").files[0];
      let updatePayload = { title };
      if (newFile) {
        document.getElementById("editUploadProgress").style.display = "block";
        const filename = `video_${Date.now()}.${newFile.name.split(".").pop()}`;
        const { error: ue } = await db.storage
          .from("videos")
          .upload(filename, newFile, { upsert: true });
        document.getElementById("editUploadProgress").style.display = "none";
        if (ue) {
          showToast("Upload failed: " + ue.message, "error");
          btn.textContent = "Save Changes";
          btn.disabled = false;
          return;
        }
        updatePayload.video_url = db.storage
          .from("videos")
          .getPublicUrl(filename).data.publicUrl;
      }

      const { error } = await db
        .from("videos")
        .update(updatePayload)
        .eq("id", id);
      btn.textContent = "Save Changes";
      btn.disabled = false;
      if (error) showToast("Error: " + error.message, "error");
      else {
        showToast("Video updated ✅");
        closeEditVideoModal();
        loadAdminVideos();
        loadData();
      }
    });

  function closeEditVideoModal() {
    document.getElementById("editVideoModal").classList.remove("open");
    document.getElementById("editVideoFile").value = "";
    document.getElementById("editVideoPreview").src = "";
    document.getElementById("editVideoPreview").style.display = "none";
    document.getElementById("editVideoReSelectBtn").style.display = "none";
    document
      .querySelectorAll(".edit-video-chip")
      .forEach((c) => c.classList.remove("active"));
  }

  document
    .getElementById("closeEditVideoModal")
    .addEventListener("click", closeEditVideoModal);
  document
    .getElementById("cancelEditVideoModal")
    .addEventListener("click", closeEditVideoModal);
  document.getElementById("editVideoFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const prev = document.getElementById("editVideoPreview");
    const reBtn = document.getElementById("editVideoReSelectBtn");
    if (file) {
      prev.src = URL.createObjectURL(file);
      prev.style.display = "block";
      reBtn.style.display = "inline-block";
    } else {
      prev.src = "";
      prev.style.display = "none";
      reBtn.style.display = "none";
    }
  });
  document
    .getElementById("editVideoReSelectBtn")
    .addEventListener("click", () => {
      document.getElementById("editVideoFile").value = "";
      document.getElementById("editVideoPreview").src = "";
      document.getElementById("editVideoPreview").style.display = "none";
      document.getElementById("editVideoReSelectBtn").style.display = "none";
      document.getElementById("editVideoFile").click();
    });

  document
    .getElementById("openAddVideoModal")
    .addEventListener("click", () =>
      document.getElementById("videoFormModal").classList.add("open"),
    );

  document.getElementById("videoFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const prev = document.getElementById("videoPreview");
    const reBtn = document.getElementById("videoReSelectBtn");
    if (file) {
      prev.src = URL.createObjectURL(file);
      prev.style.display = "block";
      reBtn.style.display = "inline-block";
    } else {
      prev.src = "";
      prev.style.display = "none";
      reBtn.style.display = "none";
    }
  });
  document.getElementById("videoReSelectBtn").addEventListener("click", () => {
    document.getElementById("videoFile").value = "";
    document.getElementById("videoPreview").src = "";
    document.getElementById("videoPreview").style.display = "none";
    document.getElementById("videoReSelectBtn").style.display = "none";
    document.getElementById("videoFile").click();
  });

  document.getElementById("videoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("videoTitle").value.trim();
    const file = document.getElementById("videoFile").files[0];
    if (!file) {
      showToast("Please select a video file.", "error");
      return;
    }
    const btn = document.getElementById("saveVideoBtn");
    btn.disabled = true;
    btn.textContent = "Uploading…";
    document.getElementById("uploadProgress").style.display = "block";
    const filename = `video_${Date.now()}.${file.name.split(".").pop()}`;
    const { error: ue } = await db.storage
      .from("videos")
      .upload(filename, file, { upsert: true });
    if (ue) {
      showToast("Upload failed: " + ue.message, "error");
      btn.disabled = false;
      btn.textContent = "Upload Video";
      document.getElementById("uploadProgress").style.display = "none";
      return;
    }
    const video_url = db.storage.from("videos").getPublicUrl(filename)
      .data.publicUrl;
    const { error } = await db.from("videos").insert([{ title, video_url }]);
    btn.disabled = false;
    btn.textContent = "Upload Video";
    document.getElementById("uploadProgress").style.display = "none";
    if (error) showToast("Error: " + error.message, "error");
    else {
      showToast("Video uploaded ✅");
      closeVideoModal();
      loadAdminVideos();
      loadData();
    }
  });

  async function deleteVideo(id) {
    if (!confirm("Delete this video?")) return;
    const { error } = await db.from("videos").delete().eq("id", id);
    if (error) showToast("Error: " + error.message, "error");
    else {
      showToast("Video deleted.");
      loadAdminVideos();
      loadData();
    }
  }

  function closeVideoModal() {
    document.getElementById("videoFormModal").classList.remove("open");
    document.getElementById("videoForm").reset();
    const prev = document.getElementById("videoPreview");
    prev.src = "";
    prev.style.display = "none";
    document.getElementById("videoReSelectBtn").style.display = "none";
  }
  document
    .getElementById("closeVideoModal")
    .addEventListener("click", closeVideoModal);
  document
    .getElementById("cancelVideoModal")
    .addEventListener("click", closeVideoModal);

  // ═══════════════════════════════════════════════════════════
  //  ADMIN — SUBSCRIBERS + CSV EXPORT (US-32) + EMAIL CAMPAIGN (US-33)
  // ═══════════════════════════════════════════════════════════
  let subscriberData = [];

  async function loadAdminSubscribers() {
    const tbody = document.getElementById("subscribersTableBody");
    tbody.innerHTML =
      '<tr><td colspan="2" class="loading-cell">Loading…</td></tr>';
    const { data, error } = await db
      .from("subscribers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="2" class="error-cell">${error.message}</td></tr>`;
      return;
    }
    subscriberData = data || [];
    document.getElementById("subscriberCount").textContent =
      `${subscriberData.length} subscriber${subscriberData.length !== 1 ? "s" : ""}`;
    if (!subscriberData.length) {
      tbody.innerHTML =
        '<tr><td colspan="2" class="loading-cell">No subscribers yet.</td></tr>';
      return;
    }
    tbody.innerHTML = subscriberData
      .map(
        (s) =>
          `<tr><td>${s.email}</td><td>${new Date(s.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td></tr>`,
      )
      .join("");
  }

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    if (!subscriberData.length) {
      showToast("No subscribers to export.", "info");
      return;
    }
    const rows = [
      "Email,Date Subscribed",
      ...subscriberData.map(
        (s) =>
          `${s.email},${new Date(s.created_at).toLocaleDateString("en-GB")}`,
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quintessence_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${subscriberData.length} subscribers exported ✅`);
  });

  // US-33: Campaign chips
  document.querySelectorAll(".campaign-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("campaignSubject").value =
        chip.dataset.subject || "";
      document.getElementById("campaignBody").value = chip.dataset.body || "";
      document
        .querySelectorAll(".campaign-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  // US-33: Send campaign via WhatsApp (opens WA with message ready) OR copy all emails
  document.getElementById("sendCampaignBtn").addEventListener("click", () => {
    if (!subscriberData.length) {
      showToast("No subscribers yet.", "info");
      return;
    }
    const subject = document.getElementById("campaignSubject").value.trim();
    const body = document.getElementById("campaignBody").value.trim();
    const status = document.getElementById("campaignStatus");
    if (!subject) {
      showToast("Please enter a subject line.", "error");
      document.getElementById("campaignSubject").focus();
      return;
    }
    if (!body) {
      showToast("Please write a message.", "error");
      document.getElementById("campaignBody").focus();
      return;
    }

    // Build a WhatsApp broadcast message
    const waMsg = `*${subject}*\n\n${body}\n\n— Quintessence`;
    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(waMsg)}`;

    // Copy the full message to clipboard for WhatsApp broadcast list use
    navigator.clipboard
      .writeText(waMsg)
      .then(() => {
        status.textContent = `Message copied! Open WhatsApp → Broadcast List → select contacts → paste.`;
        showToast(
          "Message copied to clipboard ✅ — paste into WhatsApp Broadcast",
        );
      })
      .catch(() => {
        // Fallback: open WhatsApp directly
        window.open(waUrl, "_blank");
        status.textContent = "WhatsApp opened with your message.";
      });
  });

  // Bio chips
  document.querySelectorAll(".bio-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("settingBio").value = chip.dataset.text;
      document
        .querySelectorAll(".bio-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  ADMIN — SETTINGS
  // ═══════════════════════════════════════════════════════════
  async function loadSettings() {
    if (db) {
      try {
        const { data } = await db.from("settings").select("*");
        if (data && data.length) {
          const map = {};
          data.forEach((r) => (map[r.key] = r.value));
          if (map.customers)
            document.getElementById("statCustomers").textContent =
              map.customers;
          if (map.varieties)
            document.getElementById("statVarieties").textContent =
              map.varieties;
          if (map.years)
            document.getElementById("statYears").textContent = map.years;
          if (map.bio)
            document.getElementById("aboutBio").textContent = map.bio;
          if (map.customers)
            document.getElementById("settingCustomers").value = map.customers;
          if (map.varieties)
            document.getElementById("settingVarieties").value = map.varieties;
          if (map.years)
            document.getElementById("settingYears").value = map.years;
          if (map.bio) document.getElementById("settingBio").value = map.bio;
          if (map.whatsapp) {
            document.getElementById("settingWhatsapp").value = map.whatsapp;
            applyWhatsapp(map.whatsapp);
          }
          if (map.instagram)
            document.getElementById("settingInstagram").value = map.instagram;
          return;
        }
      } catch (e) {
        /* fallback */
      }
    }
    // Fallback: localStorage
    const c = localStorage.getItem("quint_stat_customers");
    const v = localStorage.getItem("quint_stat_varieties");
    const y = localStorage.getItem("quint_stat_years");
    const b = localStorage.getItem("quint_stat_bio");
    const w = localStorage.getItem("quint_stat_whatsapp");
    const ig = localStorage.getItem("quint_stat_instagram");
    if (c) {
      document.getElementById("statCustomers").textContent = c;
      document.getElementById("settingCustomers").value = c;
    }
    if (v) {
      document.getElementById("statVarieties").textContent = v;
      document.getElementById("settingVarieties").value = v;
    }
    if (y) {
      document.getElementById("statYears").textContent = y;
      document.getElementById("settingYears").value = y;
    }
    if (b) {
      document.getElementById("aboutBio").textContent = b;
      document.getElementById("settingBio").value = b;
    }
    if (w) {
      applyWhatsapp(w);
      document.getElementById("settingWhatsapp").value = w;
    }
    if (ig) {
      document.getElementById("settingInstagram").value = ig;
    }
  }

  function applyWhatsapp(num) {
    const clean = num.replace(/\D/g, "");
    whatsappNumber = clean;
    const enquiryText = encodeURIComponent(
      "Hello, I'd like to make an enquiry about your perfumes.",
    );
    const url = `https://wa.me/${clean}`;
    const urlEnquiry = `${url}?text=${enquiryText}`;
    const el = (id) => document.getElementById(id);
    if (el("navOrderBtn")) el("navOrderBtn").href = urlEnquiry;
    if (el("heroEnquireBtn")) el("heroEnquireBtn").href = urlEnquiry;
    if (el("footerWhatsappLink")) {
      el("footerWhatsappLink").href = url;
      el("footerWhatsappLink").textContent = `+${clean}`;
    }
  }

  async function upsertSetting(key, value) {
    if (!db) return;
    await db.from("settings").upsert({ key, value }, { onConflict: "key" });
  }

  document
    .getElementById("saveSettingsBtn")
    .addEventListener("click", async () => {
      const customers = document
        .getElementById("settingCustomers")
        .value.trim();
      const varieties = document
        .getElementById("settingVarieties")
        .value.trim();
      const years = document.getElementById("settingYears").value.trim();
      const bio = document.getElementById("settingBio").value.trim();
      const whatsapp = document.getElementById("settingWhatsapp").value.trim();
      const instagram = document
        .getElementById("settingInstagram")
        .value.trim();
      if (
        !customers &&
        !varieties &&
        !years &&
        !bio &&
        !whatsapp &&
        !instagram
      ) {
        showToast("Fill in at least one field.", "error");
        return;
      }
      const btn = document.getElementById("saveSettingsBtn");
      btn.textContent = "Saving…";
      btn.disabled = true;
      if (customers) {
        document.getElementById("statCustomers").textContent = customers;
        localStorage.setItem("quint_stat_customers", customers);
      }
      if (varieties) {
        document.getElementById("statVarieties").textContent = varieties;
        localStorage.setItem("quint_stat_varieties", varieties);
      }
      if (years) {
        document.getElementById("statYears").textContent = years;
        localStorage.setItem("quint_stat_years", years);
      }
      if (bio) {
        document.getElementById("aboutBio").textContent = bio;
        localStorage.setItem("quint_stat_bio", bio);
      }
      if (whatsapp) {
        applyWhatsapp(whatsapp);
        localStorage.setItem("quint_stat_whatsapp", whatsapp);
      }
      if (instagram) {
        localStorage.setItem("quint_stat_instagram", instagram);
      }
      if (db) {
        await Promise.all([
          customers ? upsertSetting("customers", customers) : Promise.resolve(),
          varieties ? upsertSetting("varieties", varieties) : Promise.resolve(),
          years ? upsertSetting("years", years) : Promise.resolve(),
          bio ? upsertSetting("bio", bio) : Promise.resolve(),
          whatsapp ? upsertSetting("whatsapp", whatsapp) : Promise.resolve(),
          instagram ? upsertSetting("instagram", instagram) : Promise.resolve(),
        ]);
      }
      btn.textContent = "Save Settings";
      btn.disabled = false;
      showToast("Settings updated ✅");
    });

  // ═══════════════════════════════════════════════════════════
  //  START
  // ═══════════════════════════════════════════════════════════
  loadData();
  loadCart();
  loadReviews();
  loadSettings();

  if (sessionStorage.getItem("quint_admin_open")) {
    document.getElementById("adminOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
    checkAdminSession();
  }
}); // end DOMContentLoaded

// ===== Mobile Sidebar Toggle =====
document.addEventListener("DOMContentLoaded", () => {

  const sidebar = document.querySelector(".admin-sidebar");
  const toggleBtn = document.querySelector(".mobile-menu-toggle");

  let overlay = document.querySelector(".admin-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "admin-overlay";
    document.body.appendChild(overlay);
  }

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("active");
    });
  }

  overlay.addEventListener("click", () => {
    if (sidebar) sidebar.classList.remove("open");
    overlay.classList.remove("active");
  });

});
