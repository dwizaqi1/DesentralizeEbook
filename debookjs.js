(async function loadJSZip() {
    if (typeof JSZip === "undefined") {
        await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js");
    }
})();

if (typeof JSZip === "undefined") {
    console.error("JSZip tidak dimuat!");
} else {
    console.log("JSZip berhasil dimuat.");
}

class PDFViewer {
    constructor(options) {
        this.fileInput = document.getElementById(options.fileInput);
        this.pageWrapper = document.querySelector(options.pageWrapper);
        this.nextButton = document.getElementById(options.nextButton);
        this.prevButton = document.getElementById(options.prevButton);
        this.pageInput = document.getElementById(options.pageInput);
        this.pageInfo = document.getElementById(options.pageInfo);

        this.pages = [];
        this.currentPage = 0;
        this.walletInput = ""; // Wallet yang bisa diedit

        this.init();
    }

    init() {
        if (this.fileInput) {
            this.fileInput.addEventListener("change", (event) => this.handleFileInput(event));
        }
        if (this.nextButton) {
            this.nextButton.addEventListener("click", () => this.nextPage());
        }
        if (this.prevButton) {
            this.prevButton.addEventListener("click", () => this.prevPage());
        }
        if (this.pageInput) {
            this.pageInput.addEventListener("change", () => this.goToPage());
        }
    }

    setWallet(wallet) {
        this.walletInput = wallet;
    }

    async fetchSecretKey(licensePubKey, wallet) {
        try {
            const response = await fetch(`/debook/api/v1//GetKey`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ licensePubKey, wallet })
            });
    
            const data = await response.json();
    
            if (!response.ok) {
                console.error(`❌ Gagal mengambil secret key: ${data.error}`);
                return null;
            }
    
            console.log(`✅ Secret Key Diterima: ${data.secretKey}`);
            return data.secretKey;
        } catch (error) {
            console.error("❌ Terjadi kesalahan saat fetch secret key:", error);
            return null;
        }
    }    

    async decryptAES(encryptedData, key) {
        const iv = encryptedData.slice(0, 16);
        const data = encryptedData.slice(16);

        const cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            key,
            { name: "AES-CBC" },
            false,
            ["decrypt"]
        );

        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-CBC", iv: iv },
            cryptoKey,
            data
        );

        return new Uint8Array(decrypted);
    }

    async handleFileInput(event) {
        const file = event.target.files[0];
        if (!file) return;

        const zip = new JSZip();
        const zipContents = await zip.loadAsync(await file.arrayBuffer());

        const manifestFile = zipContents.file("manifest.json");
        if (!manifestFile) {
            console.error("❌ manifest.json tidak ditemukan!");
            return;
        }

        const manifestText = await manifestFile.async("text");
        const manifest = JSON.parse(manifestText);
        const licensePubKey = manifest.publicKey;

        // Gunakan wallet yang bisa diedit
        const wallet = this.walletInput;
        if (!wallet) {
            console.error("❌ Wallet belum diatur!");
            return;
        }

        const secretKey = await this.fetchSecretKey(licensePubKey, wallet);
        if (!secretKey) {
            console.error("❌ Secret key tidak ditemukan!");
            return;
        }

        if (!secretKey) {
            console.error("❌ Secret key tidak ditemukan!");
            return;
        }

        const key = new TextEncoder().encode(secretKey).slice(0, 32);

        let encryptedFile = null;
        for (const fileName of Object.keys(zipContents.files)) {
            if (fileName.endsWith(".ebookcontent")) {
                encryptedFile = zipContents.file(fileName);
                //console.log(`📂 File terenkripsi ditemukan: ${fileName}`);
                break;
            }
        }

        const encryptedData = await encryptedFile.async("uint8array");
        const decryptedData = await this.decryptAES(encryptedData, key);

        const decryptedZip = new JSZip();
        const decryptedZipContents = await decryptedZip.loadAsync(decryptedData);

        this.pages = [];

        for (const [name, file] of Object.entries(decryptedZipContents.files)) {
            if (name.startsWith("pages/") && name.endsWith(".xhtml")) {
                const content = await file.async("text");
                const imgSrcMatch = content.match(/src="\.\.\/images\/([^"]+)"/);
                if (imgSrcMatch) {
                    const imageName = imgSrcMatch[1];
                    const imageFile = decryptedZipContents.file(`images/${imageName}`);
                    if (imageFile) {
                        const imageData = await imageFile.async("base64");
                        this.pages.push({
                            content,
                            image: `data:image/png;base64,${imageData}`,
                        });
                    }
                }
            }
        }

        if (this.pages.length > 0) {
            this.currentPage = 0;
            this.renderPage();
            this.updateNavigation();
        }
    }

    renderPage() {
        const page = this.pages[this.currentPage];
        if (!page) return;
        if (!this.pageWrapper) return;

        this.pageWrapper.innerHTML = "";
        const pdfImage = document.createElement("img");
        pdfImage.id = "pdf-image";
        pdfImage.style.width = "100%";
        pdfImage.style.height = "auto";
        pdfImage.src = page.image;

        this.pageWrapper.appendChild(pdfImage);
    }

    updateNavigation() {
        if (this.pageInput) this.pageInput.value = this.currentPage + 1;
        if (this.pageInfo) this.pageInfo.textContent = `/ ${this.pages.length}`;
        if (this.prevButton) this.prevButton.disabled = this.currentPage === 0;
        if (this.nextButton) this.nextButton.disabled = this.currentPage === this.pages.length - 1;
    }

    nextPage() {
        if (this.currentPage < this.pages.length - 1) {
            this.currentPage++;
            this.renderPage();
            this.updateNavigation();
        }
    }

    prevPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.renderPage();
            this.updateNavigation();
        }
    }

    goToPage() {
        const newPage = parseInt(this.pageInput.value, 10) - 1;
        if (newPage >= 0 && newPage < this.pages.length) {
            this.currentPage = newPage;
            this.renderPage();
            this.updateNavigation();
        } else {
            this.pageInput.value = this.currentPage + 1;
        }
    }
}

// Export untuk digunakan dengan CDN
window.PDFViewer = PDFViewer;
