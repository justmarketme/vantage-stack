import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";
import { BlueprintIntakeForm } from "../../components/blueprint/BlueprintIntakeForm";

export default function BlueprintPage() {
  return (
    <div className="relative">
      <Navbar />
      <main className="pt-28">
        <section className="vs-section">
          <div className="vs-container">
            <div className="max-w-3xl">
              <BlueprintIntakeForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

