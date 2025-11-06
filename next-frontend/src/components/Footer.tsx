import React from "react";

const Footer = () => {
  return (
    <footer className="container py-8">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-text-2/80">
            &copy; {new Date().getFullYear()} KUMMAWAVE. Made in California.
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          {/* Footer links will be implemented here */}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
