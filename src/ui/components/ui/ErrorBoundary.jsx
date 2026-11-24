import { Component } from 'react';
import { CircleAlert } from 'lucide-react';

/** Catches render and data errors for a page and offers a way back, instead of a blank screen. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="surface flex items-start gap-3 rounded-[14px] p-5">
        <CircleAlert size={20} className="mt-0.5 shrink-0 text-critical" aria-hidden />
        <div>
          <p className="text-[15px] font-extrabold">This page couldn’t load</p>
          <p className="mt-1 text-[14px] text-muted-foreground">{this.state.error.message || 'Something went wrong.'}</p>
          <button type="button" onClick={() => this.setState({ error: null })} className="mt-3 text-[14px] font-bold text-brand hover:underline">
            Try again
          </button>
        </div>
      </div>
    );
  }
}
